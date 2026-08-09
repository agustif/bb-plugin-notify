import type { BbPluginApi } from "@bb/plugin-sdk";
import { deliverNotification } from "./deliver.js";
import type { NotifySettings } from "./deliver.js";
import type { NotifyStore } from "./store.js";
import {
  isTodoDispatchedWorker,
  workerDisplayTitle,
  workerRoleLabel,
} from "./worker-detect.js";

export type AutoNotifyThread = {
  id: string;
  projectId?: string | null;
  title?: string | null;
  titleFallback?: string | null;
  originPluginId?: string | null;
};

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export async function handleWorkerIdle(args: {
  bb: BbPluginApi;
  store: NotifyStore;
  settings: NotifySettings;
  thread: AutoNotifyThread;
  lastAssistantText?: string | null;
  now?: Date;
}): Promise<{ skipped: boolean; reason?: string; message?: string }> {
  const { bb, store, settings, thread } = args;
  if (settings.autoNotifyOnWorkerDone === false) {
    return { skipped: true, reason: "autoNotifyOnWorkerDone_off" };
  }
  if (!isTodoDispatchedWorker(thread)) {
    return { skipped: true, reason: "not_todo_worker" };
  }

  const role = workerRoleLabel(thread);
  const label = workerDisplayTitle(thread);
  const body = clip(args.lastAssistantText ?? "", 2000);
  const result = await deliverNotification({
    bb,
    store,
    settings,
    input: {
      title: clip(`${role} done: ${label}`, 200),
      body,
      level: "success",
    },
    threadId: thread.id,
    projectId: thread.projectId ?? null,
    now: args.now,
  });
  return { skipped: false, message: result.message };
}

export async function handleWorkerFailed(args: {
  bb: BbPluginApi;
  store: NotifyStore;
  settings: NotifySettings;
  thread: AutoNotifyThread;
  error?: string | null;
  now?: Date;
}): Promise<{ skipped: boolean; reason?: string; message?: string }> {
  const { bb, store, settings, thread } = args;
  if (settings.autoNotifyOnWorkerFail === false) {
    return { skipped: true, reason: "autoNotifyOnWorkerFail_off" };
  }
  if (!isTodoDispatchedWorker(thread)) {
    return { skipped: true, reason: "not_todo_worker" };
  }

  const role = workerRoleLabel(thread);
  const label = workerDisplayTitle(thread);
  const body = clip(args.error ?? "Thread failed", 2000);
  const result = await deliverNotification({
    bb,
    store,
    settings,
    input: {
      title: clip(`${role} failed: ${label}`, 200),
      body,
      level: "error",
    },
    threadId: thread.id,
    projectId: thread.projectId ?? null,
    now: args.now,
  });
  return { skipped: false, message: result.message };
}
