import { useCallback, useEffect, useState } from "react";
import {
  Markdown,
  definePluginApp,
  useComposerView,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
} from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { REALTIME_CHANNEL } from "./src/constants";
import type { NotificationRecord, NotifyLevel } from "./src/schemas";
import "./app.css";

type ToastPayload = {
  kind: "notification";
  id: string;
  title: string;
  body: string;
  level: NotifyLevel;
  threadId: string | null;
  projectId: string | null;
  createdAt: number;
};

type StatusSnapshot = {
  defaultChannel: "toast" | "webhook";
  quietHours: string;
  quietHoursActive: boolean;
  webhookConfigured: boolean;
  showHeaderBadge: boolean;
  autoNotifyOnWorkerDone: boolean;
  autoNotifyOnWorkerFail: boolean;
};

function isToastPayload(payload: unknown): payload is ToastPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.kind === "notification" &&
    typeof p.id === "string" &&
    typeof p.title === "string" &&
    typeof p.level === "string"
  );
}

/** Module-level so split panes / header+banner do not double-toast. */
const seenToastIds = new Set<string>();

function rememberId(id: string): boolean {
  if (seenToastIds.has(id)) return false;
  seenToastIds.add(id);
  if (seenToastIds.size > 200) {
    const first = seenToastIds.values().next().value;
    if (first !== undefined) seenToastIds.delete(first);
  }
  return true;
}

function showInAppToast(n: {
  title: string;
  body?: string;
  level: NotifyLevel;
}) {
  const body = n.body?.trim() ?? "";
  const description = body ? (
    <Markdown content={body} className="notify-toast-md" />
  ) : undefined;
  const opts = { description, duration: 8_000 };
  switch (n.level) {
    case "success":
      toast.success(n.title, opts);
      break;
    case "warning":
      toast.warning(n.title, opts);
      break;
    case "error":
      toast.error(n.title, opts);
      break;
    default:
      toast.message(n.title, opts);
  }
}

/**
 * OS / browser notification (works over bb connect remote clients too).
 * Fires when permission is already granted. Prefer background tabs so we
 * don't double-interrupt while the user is staring at the app — errors and
 * warnings always try OS as well.
 */
function showOsNotification(n: {
  title: string;
  body?: string;
  level: NotifyLevel;
}) {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission !== "granted") return;

  const hidden =
    typeof document !== "undefined"
      ? document.visibilityState === "hidden"
      : true;
  const forceOs = n.level === "error" || n.level === "warning";
  if (!hidden && !forceOs) return;

  try {
    const body = n.body?.trim() || undefined;
    const note = new Notification(n.title, {
      body,
      tag: `bb-notify-${n.level}`,
      renotify: false,
    });
    window.setTimeout(() => note.close(), 8_000);
  } catch {
    // Safari private mode / missing service worker — ignore.
  }
}

function presentNotification(n: {
  id: string;
  title: string;
  body?: string;
  level: NotifyLevel;
}) {
  if (!rememberId(n.id)) return;
  showInAppToast(n);
  showOsNotification(n);
}

function levelGlyph(level: NotifyLevel): string {
  switch (level) {
    case "success":
      return "✓";
    case "warning":
      return "!";
    case "error":
      return "✕";
    default:
      return "•";
  }
}

function formatAge(createdAt: number): string {
  const sec = Math.max(0, Math.round((Date.now() - createdAt) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return new Date(createdAt).toLocaleString();
}

/** Bridge: realtime → in-app toast + optional OS notification. */
function NotifyToastBridge() {
  useRealtime(REALTIME_CHANNEL, (payload) => {
    if (!isToastPayload(payload)) return;
    presentNotification({
      id: payload.id,
      title: payload.title,
      body: typeof payload.body === "string" ? payload.body : "",
      level: payload.level,
    });
  });
  return null;
}

function NotifyBanner() {
  const { threadId } = useComposerView();
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [latest, setLatest] = useState<NotificationRecord | null>(null);

  const refresh = useCallback(() => {
    if (!threadId) {
      setLatest(null);
      return;
    }
    void rpc
      .call("listRecent", { limit: 8, threadId })
      .then((res) => {
        const item =
          res.items.find((n) => n.threadId === threadId) ?? res.items[0] ?? null;
        if (!item) {
          setLatest(null);
          return;
        }
        const ageMs = Date.now() - item.createdAt;
        if (ageMs > 15 * 60_000) {
          setLatest(null);
          return;
        }
        setLatest(item);
      })
      .catch(() => {
        /* ignore */
      });
  }, [rpc, threadId]);

  useEffect(() => {
    refresh();
  }, [refresh, connection]);

  useRealtime(REALTIME_CHANNEL, (payload) => {
    if (
      typeof payload === "object" &&
      payload !== null &&
      (payload as { kind?: string }).kind === "list-changed"
    ) {
      refresh();
    }
    if (isToastPayload(payload)) {
      if (
        !threadId ||
        payload.threadId === threadId ||
        payload.threadId === null
      ) {
        setLatest({
          id: payload.id,
          title: payload.title,
          body: typeof payload.body === "string" ? payload.body : "",
          level: payload.level,
          channel: "toast",
          threadId: payload.threadId,
          projectId: payload.projectId,
          createdAt: payload.createdAt,
          delivered: true,
          suppressed: false,
          reason: null,
        });
      }
    }
  });

  return (
    <>
      <NotifyToastBridge />
      {latest ? (
        <div
          className="notify-banner"
          data-level={latest.level}
          role="status"
          aria-live="polite"
        >
          <span className="notify-banner-glyph" aria-hidden="true">
            {levelGlyph(latest.level)}
          </span>
          <div className="notify-banner-body">
            <div className="notify-banner-title">{latest.title}</div>
            {latest.body ? (
              <div className="notify-banner-text">
                <Markdown
                  content={latest.body}
                  className="notify-banner-md"
                />
              </div>
            ) : null}
            <div className="notify-banner-meta">
              {latest.suppressed
                ? `suppressed · ${latest.reason ?? "quiet hours"} · `
                : ""}
              {formatAge(latest.createdAt)}
              {latest.channel === "webhook" ? " · webhook" : ""}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ThreadHeaderNotify({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const settings = useSettings();
  const showBadge =
    (settings.values as { showHeaderBadge?: boolean } | undefined)
      ?.showHeaderBadge !== false;

  const [latest, setLatest] = useState<NotificationRecord | null>(null);
  const [count, setCount] = useState(0);
  const [compact, setCompact] = useState(false);
  const [osPermission, setOsPermission] = useState<string>(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  });

  const refresh = useCallback(() => {
    void rpc
      .call("listRecent", { limit: 20, threadId })
      .then((res) => {
        const cutoff = Date.now() - 60 * 60_000;
        const items = res.items.filter(
          (item) =>
            item.createdAt >= cutoff &&
            (item.threadId === threadId || item.threadId === null),
        );
        setCount(items.length);
        setLatest(items[0] ?? null);
      })
      .catch(() => {
        setCount(0);
        setLatest(null);
      });
  }, [rpc, threadId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useRealtime(REALTIME_CHANNEL, () => {
    refresh();
  });

  const requestOs = useCallback(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      setOsPermission("granted");
      return;
    }
    if (Notification.permission === "denied") {
      setOsPermission("denied");
      return;
    }
    void Notification.requestPermission().then((perm) => {
      setOsPermission(perm);
      if (perm === "granted") {
        try {
          new Notification("BB notifications enabled", {
            body: "Agents can ping you when work finishes.",
          });
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  // Keep toast bridge mounted on every open thread (incl. bb connect).
  if (!showBadge) {
    return <NotifyToastBridge />;
  }

  if (!latest && count === 0) {
    return (
      <>
        <NotifyToastBridge />
        <button
          type="button"
          className="notify-header-btn"
          data-has="false"
          data-compact={compact ? "true" : "false"}
          title={
            osPermission === "granted"
              ? "No recent notifications · OS on"
              : "No recent notifications · click to enable OS"
          }
          aria-label="Notifications"
          onClick={requestOs}
        >
          <span className="notify-header-glyph" aria-hidden="true">
            🔔
          </span>
        </button>
      </>
    );
  }

  const title = latest?.title ?? "Notifications";
  const level = latest?.level ?? "info";
  const osHint =
    osPermission === "granted"
      ? " · OS on"
      : osPermission === "denied"
        ? " · OS blocked"
        : osPermission === "unsupported"
          ? ""
          : " · click to enable OS";

  return (
    <>
      <NotifyToastBridge />
      <button
        type="button"
        className="notify-header-btn"
        data-has={count > 0 ? "true" : "false"}
        data-level={level}
        data-compact={compact ? "true" : "false"}
        title={`${title}${count > 1 ? ` · ${count} in last hour` : ""}${osHint}`}
        aria-label={
          count > 0
            ? `${count} recent notification${count === 1 ? "" : "s"}: ${title}`
            : `Notifications${osHint}`
        }
        onClick={requestOs}
      >
        <span className="notify-header-glyph" aria-hidden="true">
          {latest ? levelGlyph(level) : "🔔"}
        </span>
        {!compact && latest ? (
          <span className="notify-header-title">{title}</span>
        ) : null}
        {count > 1 ? (
          <span className="notify-header-count">{count > 9 ? "9+" : count}</span>
        ) : null}
      </button>
    </>
  );
}

function NotifySettingsStatus() {
  const rpc = useRpc<typeof rpcContract>();
  const settings = useSettings();
  const connection = useRealtimeConnectionState();
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void rpc
      .call("status", null)
      .then((res) => {
        setStatus(res);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [rpc]);

  useEffect(() => {
    refresh();
  }, [refresh, connection, settings.values]);

  if (error) {
    return (
      <div className="notify-settings">
        <div className="notify-settings-heading">Notify status</div>
        <p className="notify-settings-error">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="notify-settings">
        <div className="notify-settings-heading">Notify status</div>
        <p className="notify-settings-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="notify-settings">
      <div className="notify-settings-heading">Notify status</div>
      <p className="notify-settings-help">
        Live channel defaults and quiet-hours state. Edit the fields above to
        change them.
      </p>
      <dl className="notify-settings-grid">
        <div>
          <dt>Default channel</dt>
          <dd>{status.defaultChannel}</dd>
        </div>
        <div>
          <dt>Quiet hours</dt>
          <dd>
            {status.quietHours || "(off)"}
            <span
              className="notify-settings-pill"
              data-tone={status.quietHoursActive ? "active" : "idle"}
            >
              {status.quietHoursActive ? "active now" : "inactive"}
            </span>
          </dd>
        </div>
        <div>
          <dt>Webhook</dt>
          <dd>{status.webhookConfigured ? "configured" : "not set"}</dd>
        </div>
        <div>
          <dt>Header badge</dt>
          <dd>{status.showHeaderBadge ? "on" : "off"}</dd>
        </div>
        <div>
          <dt>Auto worker done</dt>
          <dd>{status.autoNotifyOnWorkerDone ? "on" : "off"}</dd>
        </div>
        <div>
          <dt>Auto worker fail</dt>
          <dd>{status.autoNotifyOnWorkerFail ? "on" : "off"}</dd>
        </div>
      </dl>
    </div>
  );
}

async function enableOsNotifications() {
  if (typeof Notification === "undefined") {
    toast.message("OS notifications unsupported in this client");
    return;
  }
  if (Notification.permission === "granted") {
    toast.success("OS notifications already enabled");
    return;
  }
  if (Notification.permission === "denied") {
    toast.error("OS notifications blocked — allow them in browser settings");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    toast.success("OS notifications enabled");
    try {
      new Notification("BB notifications enabled", {
        body: "Agents can ping you when work finishes.",
      });
    } catch {
      /* ignore */
    }
  } else {
    toast.message("OS notification permission not granted");
  }
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "notify-status",
    scopes: ["thread"],
    banners: [{ id: "notify-card", chrome: "bare", component: NotifyBanner }],
  });

  app.slots.experimental_threadHeaderAction({
    id: "notify-badge",
    title: "Notifications",
    component: ({ threadId }) => <ThreadHeaderNotify threadId={threadId} />,
  });

  app.slots.settingsSection({
    id: "notify-status-strip",
    title: "Status",
    description: "Current quiet-hours and channel defaults.",
    component: NotifySettingsStatus,
  });

  app.slots.sidebarFooterAction({
    id: "notify-os-enable",
    title: "Enable OS notifications",
    icon: "Notification03",
    run: enableOsNotifications,
  });
});
