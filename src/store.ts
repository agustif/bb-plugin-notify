import type { BbPluginApi } from "@bb/plugin-sdk";
import { MAX_RECENT, RECENT_KV_KEY } from "./constants.js";
import {
  notificationRecordSchema,
  type NotificationRecord,
} from "./schemas.js";

export function openNotifyStore(bb: BbPluginApi) {
  async function listRecent(limit = 20): Promise<NotificationRecord[]> {
    const raw = await bb.storage.kv.get<unknown>(RECENT_KV_KEY);
    if (!Array.isArray(raw)) return [];
    const out: NotificationRecord[] = [];
    for (const item of raw) {
      const parsed = notificationRecordSchema.safeParse(item);
      if (parsed.success) out.push(parsed.data);
    }
    return out.slice(0, Math.max(1, limit));
  }

  async function push(record: NotificationRecord): Promise<void> {
    const prev = await listRecent(MAX_RECENT);
    const next = [record, ...prev].slice(0, MAX_RECENT);
    await bb.storage.kv.set(RECENT_KV_KEY, next);
  }

  return { listRecent, push };
}

export type NotifyStore = ReturnType<typeof openNotifyStore>;
