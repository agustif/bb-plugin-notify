export const TOOL_NAME = "notify";
export const REALTIME_CHANNEL = "notify";
export const RECENT_KV_KEY = "recent-notifications";
export const MAX_RECENT = 30;

export const TOOL_DESCRIPTION =
  "Ping the user with a short notification. Use for milestones, blockers, " +
  "or when the user asked to be told when something finishes. Prefer a " +
  "concise title; put detail in body. Channels: toast (in-app + OS/connect " +
  "when permitted) or webhook (configured URL). Respects quiet hours for " +
  "non-error delivery.";

export const TOOL_INSTRUCTIONS =
  "Use the `notify` tool to ping the user (toast or webhook) when something " +
  "needs their attention or a long-running step finishes. Do not spam — one " +
  "notification per meaningful event. level: info|success|warning|error. " +
  "channel defaults to the plugin setting (toast). Quiet hours suppress " +
  "non-error toasts and webhooks; error always delivers.";
