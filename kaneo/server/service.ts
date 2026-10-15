import type { RpcOutput } from "@getpaseo/plugin";
import type {
  ConnectionStatus,
  KaneoProject,
  listTicketsRpc,
  searchTicketsRpc,
  ticketContextRpc,
  TicketDetail,
  TicketSummary,
} from "../shared/contracts";
import { clearConnection, type Connection, normalizeBaseUrl, readConnection, writeConnection } from "./credentials";
import { type BoardTask, createKaneoApi, KaneoError, type KaneoApi, type KaneoRelation } from "./kaneo-api";
import { branchName, imageUrls, parseTicketId, ticketIdentifier, ticketText } from "./ticket-text";

const PROJECTS_TTL_MS = 10 * 60_000;
const BOARD_TTL_MS = 30_000;
const DETAIL_TTL_MS = 30_000;
const BOARD_CONCURRENCY = 4;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const SEARCH_LIMIT = 20;

interface Cached<Value> {
  value: Value;
  at: number;
}

interface IndexedTask {
  task: BoardTask;
  summary: TicketSummary;
  labels: { name: string; color: string }[];
}

type TicketList = RpcOutput<typeof listTicketsRpc>;

function fresh<Value>(entry: Cached<Value> | undefined, ttl: number): entry is Cached<Value> {
  return entry !== undefined && Date.now() - entry.at < ttl;
}

async function mapLimited<Item, Result>(
  items: Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index] as Item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function relationLabel(relation: KaneoRelation, taskId: string): string {
  const outgoing = relation.sourceTaskId === taskId;
  if (relation.relationType === "subtask") return outgoing ? "subtask" : "parent";
  if (relation.relationType === "blocks") return outgoing ? "blocks" : "blocked by";
  return relation.relationType;
}

export class KaneoService {
  private connection: Connection | null = readConnection();
  private api: KaneoApi | null = null;
  private user: Cached<{ id: string; name: string; email: string }> | undefined;
  private projects: Cached<KaneoProject[]> | undefined;
  private boards = new Map<string, Cached<{ tasks: IndexedTask[]; truncated: boolean }>>();
  private details = new Map<string, Cached<TicketDetail>>();
  private list: Cached<TicketList> | undefined;
  private blockedUntil = 0;

  private reset() {
    this.api = null;
    this.user = undefined;
    this.projects = undefined;
    this.boards.clear();
    this.details.clear();
    this.list = undefined;
    this.blockedUntil = 0;
  }

  private client(): KaneoApi {
    if (!this.connection) throw new Error("Kaneo is not connected. Add the URL and an API key in the plugin settings.");
    if (Date.now() < this.blockedUntil) {
      const seconds = Math.ceil((this.blockedUntil - Date.now()) / 1000);
      throw new Error(`Kaneo rate limit reached. Try again in ${seconds} s.`);
    }
    this.api ??= createKaneoApi(this.connection.baseUrl, this.connection.apiKey);
    return this.api;
  }

  private async call<Value>(run: (api: KaneoApi) => Promise<Value>): Promise<Value> {
    try {
      return await run(this.client());
    } catch (error) {
      if (error instanceof KaneoError && error.status === 429) {
        this.blockedUntil = Date.now() + (error.retryAfterSeconds ?? 60) * 1000;
      }
      throw error;
    }
  }

  private ticketUrl(workspaceId: string, projectId: string, taskId: string): string {
    const base = this.connection?.baseUrl ?? "";
    return `${base}/dashboard/workspace/${workspaceId}/project/${projectId}/task/${taskId}`;
  }

  async status(): Promise<ConnectionStatus> {
    const connection = this.connection;
    if (!connection) return { baseUrl: null, configured: false, source: null, user: null, error: null };
    try {
      const user = await this.me();
      return { baseUrl: connection.baseUrl, configured: true, source: connection.source, user, error: null };
    } catch (error) {
      return {
        baseUrl: connection.baseUrl,
        configured: true,
        source: connection.source,
        user: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async save(baseUrlInput: string, apiKeyInput: string): Promise<ConnectionStatus> {
    if (this.connection?.source === "env") throw new Error("KANEO_URL and KANEO_API_KEY are set for the daemon.");
    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(baseUrlInput);
    } catch {
      throw new Error("Enter the full Kaneo URL, for example https://kaneo.example.com");
    }
    const apiKey = apiKeyInput.trim() || this.connection?.apiKey;
    if (!apiKey) throw new Error("Enter an API key.");
    const user = await createKaneoApi(baseUrl, apiKey).me();
    writeConnection(baseUrl, apiKey);
    this.connection = { baseUrl, apiKey, source: "file" };
    this.reset();
    this.user = { value: user, at: Date.now() };
    return { baseUrl, configured: true, source: "file", user, error: null };
  }

  async clear(): Promise<ConnectionStatus> {
    clearConnection();
    this.connection = readConnection();
    this.reset();
    return this.status();
  }

  private async me() {
    if (fresh(this.user, PROJECTS_TTL_MS)) return this.user.value;
    const user = await this.call((api) => api.me());
    this.user = { value: { id: user.id, name: user.name, email: user.email }, at: Date.now() };
    return this.user.value;
  }

  private async allProjects(force = false): Promise<KaneoProject[]> {
    if (!force && fresh(this.projects, PROJECTS_TTL_MS)) return this.projects.value;
    const workspaces = await this.call((api) => api.workspaces());
    const perWorkspace = await mapLimited(workspaces, BOARD_CONCURRENCY, async (workspace) => {
      const projects = await this.call((api) => api.projects(workspace.id));
      return projects
        .filter((project) => !project.archivedAt)
        .map((project) => ({
          id: project.id,
          name: project.name,
          slug: project.slug,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        }));
    });
    this.projects = { value: perWorkspace.flat(), at: Date.now() };
    return this.projects.value;
  }

  private async board(project: KaneoProject, force: boolean) {
    const cached = this.boards.get(project.id);
    if (!force && fresh(cached, BOARD_TTL_MS)) return cached.value;
    const { board, truncated } = await this.call((api) => api.board(project.id));
    const index = (task: BoardTask, status: string, done: boolean): IndexedTask => ({
      task,
      labels: (task.labels ?? []).map((label) => ({ name: label.name, color: label.color ?? "" })),
      summary: {
        id: task.id,
        identifier: ticketIdentifier(project.slug, task.number, task.id),
        title: task.title,
        projectId: project.id,
        status,
        done,
        priority: task.priority,
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeName,
        dueDate: task.dueDate,
        createdAt: task.createdAt,
        url: this.ticketUrl(project.workspaceId, project.id, task.id),
      },
    });
    const tasks = [
      ...board.columns.flatMap((column) => column.tasks.map((task) => index(task, column.name, column.isFinal))),
      ...(board.plannedTasks ?? []).map((task) => index(task, "Planned", false)),
    ];
    const value = { tasks, truncated };
    this.boards.set(project.id, { value, at: Date.now() });
    return value;
  }

  async listTickets(force = false): Promise<TicketList> {
    if (!force && fresh(this.list, BOARD_TTL_MS)) return this.list.value;
    try {
      const [user, projects] = await Promise.all([this.me(), this.allProjects(force)]);
      const boards = await mapLimited(projects, BOARD_CONCURRENCY, (project) => this.board(project, force));
      const truncated = projects.filter((_, index) => boards[index]?.truncated).map((project) => project.name);
      const value: TicketList = {
        projects,
        tickets: boards.flatMap((board) => board.tasks.map((entry) => entry.summary)),
        userId: user.id,
        fetchedAt: new Date().toISOString(),
        warning:
          truncated.length > 0
            ? `Only the first 500 tickets are shown for ${truncated.join(", ")}. Search by ticket ID reaches the rest.`
            : null,
      };
      this.list = { value, at: Date.now() };
      return value;
    } catch (error) {
      if (this.list) {
        const reason = error instanceof Error ? error.message : String(error);
        return { ...this.list.value, warning: `Showing tickets from ${this.list.value.fetchedAt.slice(11, 16)} UTC. ${reason}` };
      }
      throw error;
    }
  }

  private indexedTask(id: string): IndexedTask | null {
    for (const board of this.boards.values()) {
      const found = board.value.tasks.find((entry) => entry.task.id === id);
      if (found) return found;
    }
    return null;
  }

  async getTicket(id: string, force = false): Promise<TicketDetail> {
    const cached = this.details.get(id);
    if (!force && fresh(cached, DETAIL_TTL_MS)) return cached.value;
    const projects = await this.allProjects();
    const [task, comments, relations, labels, links] = await Promise.all([
      this.call((api) => api.task(id)),
      this.call((api) => api.comments(id)),
      this.call((api) => api.relations(id)),
      this.call((api) => api.labels(id)),
      this.call((api) => api.externalLinks(id)),
    ]);
    const project =
      projects.find((candidate) => candidate.id === task.projectId) ??
      ({ id: task.projectId, name: "Unknown project", slug: "", workspaceId: task.workspaceId ?? "", workspaceName: "" } satisfies KaneoProject);
    const known = this.indexedTask(id);
    let status = known?.summary.status;
    let done = known?.summary.done;
    if (status === undefined || done === undefined) {
      if (task.status === "planned") {
        status = "Planned";
        done = false;
      } else {
        const columns = await this.call((api) => api.columns(task.projectId));
        const column = columns.find((candidate) => candidate.slug === task.status);
        status = column?.name ?? task.status;
        done = column?.isFinal ?? false;
      }
    }
    const identifier = ticketIdentifier(project.slug, task.number, task.id);
    const slugOf = (projectId: string) => projects.find((candidate) => candidate.id === projectId)?.slug ?? "";
    const description = task.description ?? "";
    const detail: TicketDetail = {
      id: task.id,
      identifier,
      title: task.title,
      projectId: task.projectId,
      projectName: project.name,
      status,
      done,
      priority: task.priority,
      assigneeId: task.assigneeId,
      assigneeName: task.assigneeName,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      url: this.ticketUrl(project.workspaceId || task.workspaceId || "", task.projectId, task.id),
      description,
      labels: labels.map((label) => ({ name: label.name, color: label.color ?? "" })),
      comments,
      related: relations.flatMap((relation) => {
        const other = relation.sourceTaskId === id ? relation.targetTask : relation.sourceTask;
        if (!other) return [];
        return [
          {
            relation: relationLabel(relation, id),
            identifier: ticketIdentifier(slugOf(other.projectId), other.number, other.id),
            title: other.title,
            done: other.isCompleted,
          },
        ];
      }),
      links: links.map((link) => ({ title: link.title ?? link.url, url: link.url, kind: link.resourceType })),
      imageCount: this.attachableImageUrls(description).length,
      branchName: branchName(identifier, task.title),
    };
    this.details.set(id, { value: detail, at: Date.now() });
    return detail;
  }

  private attachableImageUrls(description: string): string[] {
    if (!this.connection) return [];
    const origin = new URL(this.connection.baseUrl).origin;
    return imageUrls(description, this.connection.baseUrl).filter((url) => new URL(url).origin === origin);
  }

  private async downloadImages(description: string) {
    const urls = this.attachableImageUrls(description);
    const images: { data: string; mimeType: string }[] = [];
    let skipped = Math.max(0, urls.length - MAX_IMAGES);
    let totalBytes = 0;
    for (const url of urls.slice(0, MAX_IMAGES)) {
      try {
        const image = await this.call((api) => api.download(url));
        if (
          !IMAGE_TYPES.has(image.mimeType) ||
          image.data.byteLength > MAX_IMAGE_BYTES ||
          totalBytes + image.data.byteLength > MAX_TOTAL_IMAGE_BYTES
        ) {
          skipped++;
          continue;
        }
        totalBytes += image.data.byteLength;
        images.push({ data: image.data.toString("base64"), mimeType: image.mimeType });
      } catch (error) {
        console.error(`[kaneo] image download failed: ${error instanceof Error ? error.message : error}`);
        skipped++;
      }
    }
    return { images, skipped };
  }

  async context(id: string, includeImages: boolean): Promise<RpcOutput<typeof ticketContextRpc>> {
    const detail = await this.getTicket(id, true);
    const { images, skipped } = includeImages
      ? await this.downloadImages(detail.description)
      : { images: [], skipped: 0 };
    return {
      identifier: detail.identifier,
      title: detail.title,
      url: detail.url,
      text: ticketText({ ...detail, attachedImages: images.length }),
      images,
      skippedImages: skipped,
    };
  }

  async search(query: string): Promise<RpcOutput<typeof searchTicketsRpc>> {
    const ticketId = parseTicketId(query);
    if (ticketId) {
      const list = await this.listTickets();
      const known = list.tickets.find((ticket) => ticket.identifier === ticketId);
      const id = known?.id ?? (await this.call((api) => api.taskByTicketId(ticketId)).catch(() => null))?.id;
      if (!id) return { items: [] };
      const detail = await this.getTicket(id);
      return {
        items: [
          {
            id: detail.id,
            identifier: detail.identifier,
            title: detail.title,
            subtitle: `${detail.projectName} · ${detail.status}`,
            url: detail.url,
            text: ticketText(detail),
            resourceType: "ticket",
          },
        ],
      };
    }

    const list = await this.listTickets();
    const needle = query.trim().toLowerCase();
    const projectName = (projectId: string) => list.projects.find((project) => project.id === projectId)?.name ?? "";
    const matches = list.tickets
      .filter((ticket) => !ticket.done)
      .filter(
        (ticket) =>
          !needle ||
          ticket.title.toLowerCase().includes(needle) ||
          ticket.identifier.toLowerCase().includes(needle),
      )
      .sort((a, b) => Number(b.assigneeId === list.userId) - Number(a.assigneeId === list.userId))
      .slice(0, SEARCH_LIMIT);
    return {
      items: matches.map((ticket) => {
        const entry = this.indexedTask(ticket.id);
        return {
          id: ticket.id,
          identifier: ticket.identifier,
          title: ticket.title,
          subtitle: `${projectName(ticket.projectId)} · ${ticket.status}`,
          url: ticket.url,
          text: ticketText({
            ...ticket,
            projectName: projectName(ticket.projectId),
            labels: entry?.labels ?? [],
            description: entry?.task.description ?? "",
            links: (entry?.task.externalLinks ?? []).map((link) => ({
              title: link.title ?? link.url,
              url: link.url,
              kind: link.resourceType,
            })),
          }),
          resourceType: "ticket",
        };
      }),
    };
  }
}
