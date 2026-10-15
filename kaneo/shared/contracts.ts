import { defineAttachmentSource, defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ConnectionStatusSchema = z.object({
  baseUrl: z.string().nullable(),
  configured: z.boolean(),
  source: z.enum(["env", "file"]).nullable(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  error: z.string().nullable(),
});
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
});
export type KaneoProject = z.infer<typeof ProjectSchema>;

export const TicketSummarySchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  projectId: z.string(),
  status: z.string(),
  done: z.boolean(),
  priority: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  url: z.string(),
});
export type TicketSummary = z.infer<typeof TicketSummarySchema>;

const RelatedTicketSchema = z.object({
  relation: z.string(),
  identifier: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export const TicketDetailSchema = TicketSummarySchema.extend({
  projectName: z.string(),
  description: z.string(),
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
  comments: z.array(z.object({ author: z.string(), createdAt: z.string(), text: z.string() })),
  related: z.array(RelatedTicketSchema),
  links: z.array(z.object({ title: z.string(), url: z.string(), kind: z.string() })),
  imageCount: z.number().int().nonnegative(),
  branchName: z.string(),
});
export type TicketDetail = z.infer<typeof TicketDetailSchema>;

export const connectionStatusRpc = defineRpc({
  name: "connection.status",
  input: z.object({}),
  output: ConnectionStatusSchema,
});

export const saveConnectionRpc = defineRpc({
  name: "connection.save",
  input: z.object({ baseUrl: z.string(), apiKey: z.string() }),
  output: ConnectionStatusSchema,
});

export const clearConnectionRpc = defineRpc({
  name: "connection.clear",
  input: z.object({}),
  output: ConnectionStatusSchema,
});

export const listTicketsRpc = defineRpc({
  name: "tickets.list",
  input: z.object({ force: z.boolean().optional() }),
  output: z.object({
    projects: z.array(ProjectSchema),
    tickets: z.array(TicketSummarySchema),
    userId: z.string(),
    fetchedAt: z.string(),
    warning: z.string().nullable(),
  }),
});

export const getTicketRpc = defineRpc({
  name: "tickets.get",
  input: z.object({ id: z.string(), force: z.boolean().optional() }),
  output: TicketDetailSchema,
});

export const ticketContextRpc = defineRpc({
  name: "tickets.context",
  input: z.object({ id: z.string(), includeImages: z.boolean() }),
  output: z.object({
    identifier: z.string(),
    title: z.string(),
    url: z.string(),
    text: z.string(),
    images: z.array(z.object({ data: z.string(), mimeType: z.string() })),
    skippedImages: z.number().int().nonnegative(),
  }),
});

export const searchTicketsRpc = defineRpc({
  name: "tickets.search",
  input: z.object({ query: z.string() }),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        subtitle: z.string().optional(),
        url: z.string().url(),
        text: z.string(),
        resourceType: z.string(),
      }),
    ),
  }),
});

export const ticketAttachments = defineAttachmentSource({
  id: "kaneo-ticket",
  title: "Kaneo ticket",
  icon: "SquareKanban",
  pickerTitle: "Attach Kaneo ticket",
  searchPlaceholder: "Search by ticket ID or title",
  search: searchTicketsRpc,
});
