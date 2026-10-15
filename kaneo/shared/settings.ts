import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const TargetSchema = z.object({ serverId: z.string().nullable(), projectId: z.string() });
export type StartTarget = z.infer<typeof TargetSchema>;

const V1Schema = z.object({ projectByKaneoProject: z.record(z.string(), z.string()).default({}) }).passthrough();

export const preferences = defineSettings({
  id: "preferences",
  scope: "host",
  version: 2,
  schema: z.object({
    attachImages: z.boolean().default(true),
    defaultModel: z.string().nullable().default(null),
    targetByKaneoProject: z.record(z.string(), TargetSchema).default({}),
  }),
  migrate(values, fromVersion) {
    if (fromVersion !== 1) return values;
    const { projectByKaneoProject, ...rest } = V1Schema.parse(values);
    const targetByKaneoProject = Object.fromEntries(
      Object.entries(projectByKaneoProject).map(([kaneoProjectId, projectId]) => [
        kaneoProjectId,
        { serverId: null, projectId },
      ]),
    );
    return { ...rest, targetByKaneoProject };
  },
});
