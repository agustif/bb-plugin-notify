import type { BbPluginApi } from "@bb/plugin-sdk";
import { REALTIME_CHANNEL } from "./constants.js";
import { shouldSuppressForQuietHours, quietHoursFromSetting } from "./suppress.js";
import type {
  NotificationRecord,
  NotifyChannel,
  NotifyLevel,
  NotifyToolInput,
} from "./schemas.js";
import type { NotifyStore } from "./store.js";
import { normalizeWebhookUrl } from "./webhook.js";

export type NotifySettings = {
  webhookUrl: string | undefined;
  quietHours: string;
  defaultChannel: NotifyChannel;
  /** Extra UI settings may be present; delivery ignores them. */
  showHeaderBadge?: boolean;
  /** Auto-ping when a todo-dispatched worker goes idle. Default true. */
  autoNotifyOnWorkerDone?: boolean;
  /** Auto-ping when a todo-dispatched worker fails. Default true. */
  autoNotifyOnWorkerFail?: boolean;
};

export type DeliverResult = {
  id: string;
  channel: NotifyChannel;
  delivered: boolean;
  suppressed: boolean;
  reason: string | null;
  message: string;
};

function newId(): string {
  return `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function postWebhook(
  url: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "bb-plugin-notify/0.1",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        detail: `webhook HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      };
    }
    return { ok: true, detail: `webhook HTTP ${res.status}` };
  } catch (error) {
    return {
      ok: false,
      detail: `webhook failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export async function deliverNotification(args: {
  bb: BbPluginApi;
  store: NotifyStore;
  settings: NotifySettings;
  input: NotifyToolInput;
  threadId: string | null;
  projectId: string | null;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<DeliverResult> {
  const { bb, store, settings, input, threadId, projectId } = args;
  const channel: NotifyChannel = input.channel ?? settings.defaultChannel;
  const level: NotifyLevel = input.level;
  const title = input.title.trim();
  const body = (input.body ?? "").trim();
  const id = newId();
  const createdAt = Date.now();
  const now = args.now ?? new Date();
  const fetchImpl = args.fetchImpl ?? fetch;

  const quiet = quietHoursFromSetting(settings.quietHours);
  const suppressQuiet = shouldSuppressForQuietHours(quiet, level, now);

  let delivered = false;
  let suppressed = false;
  let reason: string | null = null;

  if (channel === "toast") {
    if (suppressQuiet) {
      suppressed = true;
      reason = "quiet_hours";
    } else {
      try {
        // Realtime fans out to every connected client (local desktop,
        // browser tab, and bb connect remote sessions). The app bridge
        // turns this into an in-app sonner toast and, when permitted, an
        // OS/browser notification.
        bb.realtime.publish(REALTIME_CHANNEL, {
          kind: "notification",
          id,
          title,
          body,
          level,
          threadId,
          projectId,
          createdAt,
        });
        delivered = true;
      } catch (error) {
        reason = `realtime publish failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        bb.log.warn(reason);
      }
    }
  } else {
    // webhook
    const url = normalizeWebhookUrl(settings.webhookUrl);
    if (!url) {
      reason = settings.webhookUrl?.trim()
        ? "webhook_url_invalid"
        : "webhook_not_configured";
      suppressed = true;
    } else if (suppressQuiet) {
      suppressed = true;
      reason = "quiet_hours";
    } else {
      const result = await postWebhook(
        url,
        {
          id,
          title,
          body,
          level,
          channel,
          threadId,
          projectId,
          createdAt,
          source: "bb-plugin-notify",
        },
        fetchImpl,
      );
      delivered = result.ok;
      reason = result.ok ? null : result.detail;
      if (!result.ok) bb.log.warn(result.detail);
    }
  }

  const record: NotificationRecord = {
    id,
    title,
    body,
    level,
    channel,
    threadId,
    projectId,
    createdAt,
    delivered,
    suppressed,
    reason,
  };
  try {
    await store.push(record);
  } catch (error) {
    bb.log.warn(
      `failed to persist notification: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Also signal list refresh for any banner UI.
  try {
    bb.realtime.publish(REALTIME_CHANNEL, {
      kind: "list-changed",
      id,
      threadId,
    });
  } catch {
    // ignore secondary signal failures
  }

  const message = suppressed
    ? `Notification suppressed (${reason ?? "unknown"}): ${title}`
    : delivered
      ? `Notification delivered via ${channel}: ${title}`
      : `Notification failed (${reason ?? "unknown"}): ${title}`;

  return { id, channel, delivered, suppressed, reason, message };
}
