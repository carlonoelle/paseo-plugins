import type { TicketDetail } from "../shared/contracts";

const TICKET_ID = /^\s*([A-Za-z][A-Za-z0-9]*)-(\d+)\s*$/;

export function parseTicketId(query: string): string | null {
  const match = TICKET_ID.exec(query);
  return match ? `${match[1]?.toUpperCase()}-${match[2]}` : null;
}

export function ticketIdentifier(slug: string, number: number | null, fallbackId: string): string {
  return number === null ? fallbackId.slice(0, 8) : `${slug.toUpperCase()}-${number}`;
}

export function branchName(identifier: string, title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${identifier.toLowerCase()}-${slug}`.slice(0, 60).replace(/-+$/, "");
}

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_IMAGE = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;

export function imageUrls(markdown: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  for (const pattern of [MARKDOWN_IMAGE, HTML_IMAGE]) {
    for (const match of markdown.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      try {
        urls.add(new URL(raw, baseUrl).toString());
      } catch {}
    }
  }
  return [...urls];
}

function priorityText(priority: string): string | null {
  return priority && priority !== "no-priority" ? priority : null;
}

export interface TicketTextInput {
  identifier: string;
  title: string;
  url: string;
  projectName?: string;
  status: string;
  priority: string;
  assigneeName: string | null;
  dueDate: string | null;
  labels: { name: string }[];
  description: string;
  related?: TicketDetail["related"];
  links: TicketDetail["links"];
  comments?: TicketDetail["comments"];
  attachedImages?: number;
}

export function ticketText(ticket: TicketTextInput): string {
  const facts = [
    ticket.projectName ? `Project: ${ticket.projectName}` : null,
    `Status: ${ticket.status}`,
    priorityText(ticket.priority) ? `Priority: ${ticket.priority}` : null,
    `Assignee: ${ticket.assigneeName ?? "unassigned"}`,
    ticket.dueDate ? `Due: ${ticket.dueDate.slice(0, 10)}` : null,
  ].filter((fact): fact is string => fact !== null);

  const lines = [`Kaneo ticket ${ticket.identifier}: ${ticket.title}`, `URL: ${ticket.url}`, facts.join(" · ")];
  if (ticket.labels.length > 0) lines.push(`Labels: ${ticket.labels.map((label) => label.name).join(", ")}`);
  lines.push("", "## Description", "", ticket.description.trim() || "No description.");

  if (ticket.attachedImages) {
    const count = ticket.attachedImages === 1 ? "1 image" : `${ticket.attachedImages} images`;
    lines.push("", `${count} hosted on Kaneo, attached to this message in the order they appear in the description.`);
  }

  if (ticket.related && ticket.related.length > 0) {
    lines.push("", "## Related tickets", "");
    for (const item of ticket.related) {
      lines.push(`- [${item.done ? "x" : " "}] ${item.relation}: ${item.identifier} ${item.title}`);
    }
  }

  if (ticket.links.length > 0) {
    lines.push("", "## Links", "");
    for (const link of ticket.links) lines.push(`- ${link.title} (${link.kind}): ${link.url}`);
  }

  if (ticket.comments && ticket.comments.length > 0) {
    lines.push("", `## Comments (${ticket.comments.length})`);
    for (const comment of ticket.comments) {
      lines.push("", `### ${comment.author}, ${comment.createdAt.slice(0, 16).replace("T", " ")}`, "", comment.text.trim());
    }
  }

  return lines.join("\n");
}
