import { z } from "zod";

export const notifyLevelSchema = z.enum([
  "info",
  "success",
  "warning",
  "error",
]);
export type NotifyLevel = z.infer<typeof notifyLevelSchema>;

export const notifyChannelSchema = z.enum(["toast", "webhook"]);
export type NotifyChannel = z.infer<typeof notifyChannelSchema>;

export const notifyToolInputSchema = z
  .object({
    title: z
      .string()
      .min(1, "title is required")
      .max(200, "title max 200 chars"),
    body: z.string().max(2000, "body max 2000 chars").optional().default(""),
    level: notifyLevelSchema.optional().default("info"),
    channel: notifyChannelSchema.optional(),
  })
  .strict();

export type NotifyToolInput = z.infer<typeof notifyToolInputSchema>;

export const notificationRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  level: notifyLevelSchema,
  channel: notifyChannelSchema,
  threadId: z.string().nullable(),
  projectId: z.string().nullable(),
  createdAt: z.number().int(),
  delivered: z.boolean(),
  suppressed: z.boolean(),
  reason: z.string().nullable(),
});

export type NotificationRecord = z.infer<typeof notificationRecordSchema>;
