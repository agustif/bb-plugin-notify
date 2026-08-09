import { type BbPluginApi } from "@bb/plugin-sdk";
import { handleWorkerFailed, handleWorkerIdle } from "./src/auto-notify.js";
import {
  TOOL_DESCRIPTION,
  TOOL_INSTRUCTIONS,
  TOOL_NAME,
} from "./src/constants.js";
import { deliverNotification } from "./src/deliver.js";
import { isWithinQuietHours, parseQuietHours } from "./src/quiet-hours.js";
import { rpcContract } from "./src/rpc.js";
import {
  notifyChannelSchema,
  notifyToolInputSchema,
  type NotifyChannel,
} from "./src/schemas.js";
import { openNotifyStore } from "./src/store.js";
import { isValidWebhookUrl } from "./src/webhook.js";

export { rpcContract } from "./src/rpc.js";

export default async function plugin(bb: BbPluginApi) {
  const store = openNotifyStore(bb);

  const settings = bb.settings.define({
    webhookUrl: {
      type: "string",
      label: "Webhook URL",
      secret: true,
      description:
        "Optional HTTPS endpoint that receives POSTed JSON notifications when channel is webhook.",
    },
    quietHours: {
      type: "string",
      label: "Quiet hours",
      default: "",
      description:
        'Local server time window to suppress non-error notifications, e.g. "22:00-08:00". Spans may cross midnight. Empty disables.',
    },
    defaultChannel: {
      type: "select",
      label: "Default channel",
      options: ["toast", "webhook"],
      default: "toast",
      description: "Used when the notify tool omits channel.",
    },
    showHeaderBadge: {
      type: "boolean",
      label: "Show header badge",
      default: true,
      description:
        "Show a thread-header badge for the latest notification on that thread.",
    },
    autoNotifyOnWorkerDone: {
      type: "boolean",
      label: "Notify when todo workers finish",
      default: true,
      description:
        "Auto-notify (success) when a todo-dispatched worker/scout/reviewer thread goes idle.",
    },
    autoNotifyOnWorkerFail: {
      type: "boolean",
      label: "Notify when todo workers fail",
      default: true,
      description:
        "Auto-notify (error) when a todo-dispatched worker/scout/reviewer thread fails. Errors always deliver, even in quiet hours.",
    },
  });

  const readSettings = async () => {
    const s = await settings.get();
    const channelParse = notifyChannelSchema.safeParse(s.defaultChannel);
    const defaultChannel: NotifyChannel = channelParse.success
      ? channelParse.data
      : "toast";
    return {
      webhookUrl: s.webhookUrl,
      quietHours: s.quietHours ?? "",
      defaultChannel,
      showHeaderBadge: s.showHeaderBadge !== false,
      autoNotifyOnWorkerDone: s.autoNotifyOnWorkerDone !== false,
      autoNotifyOnWorkerFail: s.autoNotifyOnWorkerFail !== false,
    };
  };

  bb.rpc.register(rpcContract, {
    async listRecent({ limit, threadId }) {
      const items = await store.listRecent(limit ?? 20);
      if (!threadId) return { items };
      return {
        items: items.filter(
          (item) => item.threadId === threadId || item.threadId === null,
        ),
      };
    },
    async status() {
      const s = await readSettings();
      const quiet = parseQuietHours(s.quietHours);
      return {
        defaultChannel: s.defaultChannel,
        quietHours: s.quietHours,
        quietHoursActive: isWithinQuietHours(quiet),
        webhookConfigured: isValidWebhookUrl(s.webhookUrl),
        showHeaderBadge: s.showHeaderBadge,
        autoNotifyOnWorkerDone: s.autoNotifyOnWorkerDone,
        autoNotifyOnWorkerFail: s.autoNotifyOnWorkerFail,
      };
    },
  });

  bb.agents.registerTool({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    instructions: TOOL_INSTRUCTIONS,
    experimental_statusLabels: {
      pending: "Sending notification",
      completed: "Sent notification",
    },
    parameters: notifyToolInputSchema,
    async execute(input, ctx) {
      const s = await readSettings();
      const result = await deliverNotification({
        bb,
        store,
        settings: s,
        input,
        threadId: ctx.threadId ?? null,
        projectId: ctx.projectId ?? null,
      });
      return result.message;
    },
  });

  bb.agents.configure(() => ({
    tools: [TOOL_NAME],
    skills: ["notify"],
  }));

  // Auto-notify when todo-dispatched workers finish or fail.
  bb.events.on("thread.idle", async ({ thread, lastAssistantText }) => {
    try {
      const s = await readSettings();
      const result = await handleWorkerIdle({
        bb,
        store,
        settings: s,
        thread: {
          id: thread.id,
          projectId: thread.projectId,
          title: thread.title,
          titleFallback: thread.titleFallback,
          originPluginId: thread.originPluginId,
        },
        lastAssistantText,
      });
      if (!result.skipped) {
        bb.log.info(`auto-notify idle: ${result.message ?? thread.id}`);
      }
    } catch (error) {
      bb.log.warn(
        `auto-notify idle failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  bb.events.on("thread.failed", async ({ thread, error }) => {
    try {
      const s = await readSettings();
      const result = await handleWorkerFailed({
        bb,
        store,
        settings: s,
        thread: {
          id: thread.id,
          projectId: thread.projectId,
          title: thread.title,
          titleFallback: thread.titleFallback,
          originPluginId: thread.originPluginId,
        },
        error,
      });
      if (!result.skipped) {
        bb.log.info(`auto-notify fail: ${result.message ?? thread.id}`);
      }
    } catch (err) {
      bb.log.warn(
        `auto-notify fail handler failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  });

  bb.cli.register({
    name: "notify",
    summary: "Send or inspect agent→user notifications",
    commands: [
      {
        name: "send",
        summary: "Send a notification now",
        usage: "bb notify send [--level info|success|warning|error] [--channel toast|webhook] <title> [body...]",
      },
      {
        name: "recent",
        summary: "List recent notifications",
        usage: "bb notify recent [--limit N]",
      },
      {
        name: "status",
        summary: "Show channel / quiet-hours status",
        usage: "bb notify status",
      },
    ],
    async run(argv) {
      const [cmd, ...rest] = argv;
      if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
        return {
          exitCode: 0,
          stdout:
            "Usage:\n" +
            "  bb notify send [--level L] [--channel C] <title> [body...]\n" +
            "  bb notify recent [--limit N]\n" +
            "  bb notify status\n",
        };
      }

      if (cmd === "status") {
        const s = await readSettings();
        const quiet = parseQuietHours(s.quietHours);
        const webhookRaw = s.webhookUrl?.trim() ?? "";
        const lines = [
          `defaultChannel: ${s.defaultChannel}`,
          `quietHours: ${s.quietHours || "(off)"}`,
          `quietHoursActive: ${isWithinQuietHours(quiet)}`,
          `webhookConfigured: ${isValidWebhookUrl(webhookRaw)}`,
          webhookRaw && !isValidWebhookUrl(webhookRaw)
            ? "webhookUrl: invalid (need http(s) URL without credentials)"
            : null,
          `showHeaderBadge: ${s.showHeaderBadge}`,
          `autoNotifyOnWorkerDone: ${s.autoNotifyOnWorkerDone}`,
          `autoNotifyOnWorkerFail: ${s.autoNotifyOnWorkerFail}`,
          "",
        ].filter((line): line is string => line !== null);
        return { exitCode: 0, stdout: lines.join("\n") };
      }

      if (cmd === "recent") {
        let limit = 10;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === "--limit" && rest[i + 1]) {
            limit = Number(rest[i + 1]);
            i++;
          }
        }
        const items = await store.listRecent(
          Number.isFinite(limit) && limit > 0 ? limit : 10,
        );
        if (items.length === 0) {
          return { exitCode: 0, stdout: "(no notifications yet)\n" };
        }
        const lines = items.map((item) => {
          const when = new Date(item.createdAt).toISOString();
          const flags = [
            item.delivered ? "delivered" : null,
            item.suppressed ? "suppressed" : null,
            item.reason,
          ]
            .filter(Boolean)
            .join(",");
          return `${when}  [${item.level}/${item.channel}] ${item.title}${
            flags ? `  (${flags})` : ""
          }`;
        });
        return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
      }

      if (cmd === "send") {
        let level: "info" | "success" | "warning" | "error" = "info";
        let channel: NotifyChannel | undefined;
        const positional: string[] = [];
        for (let i = 0; i < rest.length; i++) {
          const a = rest[i]!;
          if (a === "--level" && rest[i + 1]) {
            level = rest[++i] as typeof level;
            continue;
          }
          if (a === "--channel" && rest[i + 1]) {
            channel = rest[++i] as NotifyChannel;
            continue;
          }
          if (a.startsWith("--")) {
            return {
              exitCode: 2,
              stderr: `Unknown flag: ${a}\n`,
            };
          }
          positional.push(a);
        }
        const title = positional[0];
        if (!title) {
          return {
            exitCode: 2,
            stderr: "Usage: bb notify send [--level L] [--channel C] <title> [body...]\n",
          };
        }
        const body = positional.slice(1).join(" ");
        const parsed = notifyToolInputSchema.safeParse({
          title,
          body,
          level,
          channel,
        });
        if (!parsed.success) {
          return {
            exitCode: 2,
            stderr: `${parsed.error.issues.map((i) => i.message).join("; ")}\n`,
          };
        }
        const s = await readSettings();
        const result = await deliverNotification({
          bb,
          store,
          settings: s,
          input: parsed.data,
          threadId: null,
          projectId: null,
        });
        return {
          exitCode: result.delivered || result.suppressed ? 0 : 1,
          stdout: `${result.message}\n`,
        };
      }

      return {
        exitCode: 2,
        stderr: `Unknown command: ${cmd}\n`,
      };
    },
  });

  bb.log.info("notify plugin loaded");
  bb.onDispose(() => {
    bb.log.info("notify plugin disposed");
  });
}
