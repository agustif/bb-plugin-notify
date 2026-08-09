import { defineRpcContract } from "@bb/plugin-sdk";
import { z } from "zod";
import { notificationRecordSchema, notifyChannelSchema } from "./schemas.js";

export const rpcContract = defineRpcContract({
  listRecent: {
    input: z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
        threadId: z.string().optional(),
      })
      .strict(),
    output: z.object({
      items: z.array(notificationRecordSchema),
    }),
  },
  status: {
    input: z.null(),
    output: z.object({
      defaultChannel: notifyChannelSchema,
      quietHours: z.string(),
      quietHoursActive: z.boolean(),
      webhookConfigured: z.boolean(),
      showHeaderBadge: z.boolean(),
      autoNotifyOnWorkerDone: z.boolean(),
      autoNotifyOnWorkerFail: z.boolean(),
    }),
  },
});
