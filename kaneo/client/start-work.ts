import type { usePaseo } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import type { ticketContextRpc } from "../shared/contracts";

type PaseoApi = ReturnType<typeof usePaseo>;
export type TicketContext = RpcOutput<typeof ticketContextRpc>;

export interface StartWorkInput {
  context: TicketContext;
  ticketId: string;
  note: string;
  model: string;
  project: { projectId: string; projectRootPath: string };
  branchName: string;
}

const TITLE_LIMIT = 80;

export function agentTitle(identifier: string, title: string): string {
  const full = `${identifier} ${title}`.trim();
  return full.length > TITLE_LIMIT ? `${full.slice(0, TITLE_LIMIT - 1)}…` : full;
}

export function ticketAttachment(context: TicketContext) {
  return {
    type: "text" as const,
    mimeType: "text/plain" as const,
    title: `${context.identifier} ${context.title}`,
    text: context.text,
    externalResource: {
      provider: "kaneo",
      providerLabel: "Kaneo",
      resourceType: "ticket",
      id: context.identifier,
      identifier: context.identifier,
      title: context.title,
      url: context.url,
    },
  };
}

export function defaultInstruction(identifier: string): string {
  return `Work on Kaneo ticket ${identifier}. The full ticket is attached.`;
}

export async function startWork(
  paseo: PaseoApi,
  input: StartWorkInput,
): Promise<{ workspaceId: string; agentId: string }> {
  const { context } = input;
  const title = agentTitle(context.identifier, context.title);
  const workspace = await paseo.workspaces.create({
    title,
    source: {
      kind: "worktree",
      projectId: input.project.projectId,
      cwd: input.project.projectRootPath,
      action: "branch-off",
      branchName: input.branchName,
    },
  });
  try {
    const agent = await workspace.agents.create({
      config: { provider: input.model },
      title,
      prompt: input.note.trim() || defaultInstruction(context.identifier),
      attachments: [ticketAttachment(context)],
      ...(context.images.length > 0 ? { images: context.images } : {}),
      labels: { kaneo: context.identifier, "kaneo-id": input.ticketId },
    });
    return { workspaceId: workspace.id, agentId: agent.id };
  } catch (error) {
    await workspace.archive().catch(() => undefined);
    throw error;
  }
}
