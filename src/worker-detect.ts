/**
 * Detect todo-dispatched worker threads.
 *
 * Todo spawn titles look like `[Worker:api.routes] Routes…` (role label is
 * title-cased). Match case-insensitively on worker/scout/reviewer, or accept
 * any thread whose origin plugin is `todo`. Custom roles use `[Label:id]`.
 */
const TODO_ROLE_TITLE = /^\[(worker|scout|reviewer):/i;
/** Any `[RoleOrLabel:id]` prefix from todo dispatch. */
const TITLE_ROLE_PREFIX = /^\[([^:\]]+):/;

export type WorkerThreadIdentity = {
  title?: string | null;
  originPluginId?: string | null;
};

export function isTodoDispatchedWorker(thread: WorkerThreadIdentity): boolean {
  if (thread.originPluginId === "todo") return true;
  const title = thread.title?.trim() ?? "";
  return TODO_ROLE_TITLE.test(title);
}

/**
 * Human role label for auto-notify titles ("Reviewer", "Scout", "Worker", …).
 * Reads the bracket prefix from the todo-spawned title when present.
 */
export function workerRoleLabel(thread: WorkerThreadIdentity): string {
  const title = thread.title?.trim() ?? "";
  const m = TITLE_ROLE_PREFIX.exec(title);
  if (!m) return "Worker";
  const raw = m[1]!.trim();
  if (!raw) return "Worker";
  const lower = raw.toLowerCase();
  if (lower === "worker") return "Worker";
  if (lower === "scout") return "Scout";
  if (lower === "reviewer") return "Reviewer";
  // Custom role label — keep casing if mixed/title case, else capitalize.
  if (raw !== lower && raw !== raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function workerDisplayTitle(thread: {
  title?: string | null;
  titleFallback?: string | null;
  id: string;
}): string {
  return (
    thread.title?.trim() ||
    thread.titleFallback?.trim() ||
    thread.id
  );
}
