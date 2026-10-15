import { z } from "zod";

const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });

const WorkspaceSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() });

const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  slug: z.string(),
  archivedAt: z.string().nullable().optional(),
});

const LabelSchema = z.object({ name: z.string(), color: z.string().nullable().catch(null) });

const ExternalLinkSchema = z.object({
  resourceType: z.string(),
  url: z.string(),
  title: z.string().nullable(),
});

const BoardTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  number: z.number().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  projectId: z.string(),
  labels: z.array(LabelSchema).optional(),
  externalLinks: z.array(ExternalLinkSchema).optional(),
});
export type BoardTask = z.infer<typeof BoardTaskSchema>;

const BoardSchema = z.object({
  data: z.object({
    columns: z.array(
      z.object({
        slug: z.string(),
        name: z.string(),
        isFinal: z.boolean(),
        tasks: z.array(BoardTaskSchema),
      }),
    ),
    plannedTasks: z.array(BoardTaskSchema).optional(),
  }),
  pagination: z.object({ page: z.number(), totalPages: z.number() }).optional(),
});
export type Board = z.infer<typeof BoardSchema>["data"];

const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  number: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  workspaceId: z.string().optional(),
});
export type KaneoTask = z.infer<typeof TaskSchema>;

const ColumnSchema = z.object({ slug: z.string(), name: z.string(), isFinal: z.boolean() });
export type KaneoColumn = z.infer<typeof ColumnSchema>;

const CommentSchema = z.object({
  createdAt: z.string(),
  content: z.string(),
  user: z.object({ name: z.string() }).nullable(),
});
export type KaneoComment = { author: string; createdAt: string; text: string };

const RelatedTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  number: z.number().nullable(),
  projectId: z.string(),
  isCompleted: z.boolean(),
});

const RelationSchema = z.object({
  sourceTaskId: z.string(),
  targetTaskId: z.string(),
  relationType: z.string(),
  sourceTask: RelatedTaskSchema.nullable(),
  targetTask: RelatedTaskSchema.nullable(),
});
export type KaneoRelation = z.infer<typeof RelationSchema>;

const ErrorBodySchema = z.object({ message: z.string() });

export class KaneoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "KaneoError";
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BOARD_PAGES = 5;

function describeFailure(status: number, message: string | null, retryAfter: number | null) {
  if (status === 401) return "Kaneo rejected the API key. Check it in the plugin settings.";
  if (status === 403) return `Kaneo denied access${message ? `: ${message}` : ""}.`;
  if (status === 429) {
    const wait = retryAfter ? ` Try again in ${retryAfter} s.` : "";
    return `Kaneo rate limit reached (100 requests per minute per key).${wait}`;
  }
  return message ? `Kaneo: ${message} (HTTP ${status})` : `Kaneo request failed (HTTP ${status}).`;
}

export function createKaneoApi(baseUrl: string, apiKey: string) {
  const apiBase = `${baseUrl}/api`;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };

  async function request(url: string): Promise<Response> {
    let response: Response;
    try {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
      response = await fetch(url, { headers, signal: timeout.signal }).finally(() => clearTimeout(timer));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new KaneoError(`Kaneo is not reachable at ${baseUrl}: ${reason}`, 0);
    }
    if (response.ok) return response;
    const retryAfterHeader = Number(response.headers.get("retry-after"));
    const retryAfter = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : null;
    const body = ErrorBodySchema.safeParse(await response.json().catch(() => null));
    throw new KaneoError(
      describeFailure(response.status, body.success ? body.data.message : null, retryAfter),
      response.status,
      retryAfter,
    );
  }

  async function get<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
    query: Record<string, string> = {},
  ): Promise<z.infer<Schema>> {
    const url = new URL(`${apiBase}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await request(url.toString());
    const json: unknown = await response.json().catch(() => {
      throw new KaneoError(`Kaneo returned no JSON for ${path}. Is ${baseUrl} a Kaneo instance?`, 0);
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      console.error(`[kaneo] unexpected response for ${path}`, parsed.error.issues.slice(0, 3));
      throw new KaneoError(`Kaneo returned an unexpected response for ${path}.`, 0);
    }
    return parsed.data;
  }

  return {
    me: () => get("/user/me", UserSchema),
    workspaces: () => get("/workspace", z.array(WorkspaceSchema)),
    projects: (workspaceId: string) => get("/project", z.array(ProjectSchema), { workspaceId }),
    columns: (projectId: string) => get(`/column/${projectId}`, z.array(ColumnSchema)),
    task: (id: string) => get(`/task/${id}`, TaskSchema),
    taskByTicketId: (ticketId: string) => get(`/task/by-ticket-id/${encodeURIComponent(ticketId)}`, TaskSchema),
    labels: (taskId: string) => get(`/label/task/${taskId}`, z.array(LabelSchema)),
    externalLinks: (taskId: string) => get(`/external-link/task/${taskId}`, z.array(ExternalLinkSchema)),
    relations: (taskId: string) => get(`/task-relation/${taskId}`, z.array(RelationSchema)),

    async comments(taskId: string): Promise<KaneoComment[]> {
      const comments = await get(`/comment/${taskId}`, z.array(CommentSchema));
      return comments.map((comment) => ({
        author: comment.user?.name ?? "Unknown",
        createdAt: comment.createdAt,
        text: comment.content,
      }));
    },

    async board(projectId: string): Promise<{ board: Board; truncated: boolean }> {
      const first = await get(`/task/tasks/${projectId}`, BoardSchema, { limit: "100", page: "1" });
      const board = first.data;
      const totalPages = first.pagination?.totalPages ?? 1;
      const lastPage = Math.min(totalPages, MAX_BOARD_PAGES);
      for (let page = 2; page <= lastPage; page++) {
        const next = await get(`/task/tasks/${projectId}`, BoardSchema, {
          limit: "100",
          page: String(page),
        });
        for (const column of next.data.columns) {
          const target = board.columns.find((existing) => existing.slug === column.slug);
          if (target) target.tasks.push(...column.tasks);
          else board.columns.push(column);
        }
        board.plannedTasks = [...(board.plannedTasks ?? []), ...(next.data.plannedTasks ?? [])];
      }
      return { board, truncated: totalPages > MAX_BOARD_PAGES };
    },

    async download(url: string): Promise<{ data: Buffer; mimeType: string }> {
      const response = await request(url);
      const mimeType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
      return { data: Buffer.from(await response.arrayBuffer()), mimeType };
    },
  };
}

export type KaneoApi = ReturnType<typeof createKaneoApi>;
