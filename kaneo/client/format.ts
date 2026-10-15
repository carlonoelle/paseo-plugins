export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function priorityLabel(priority: string): string | null {
  return PRIORITY_LABELS[priority] ?? null;
}

export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const due = new Date(iso).getTime();
  return !Number.isNaN(due) && due < Date.now();
}

export function readableMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => `[image${alt ? `: ${alt}` : ""}]`)
    .replace(/<img\b[^>]*>/gi, "[image]")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .trim();
}
