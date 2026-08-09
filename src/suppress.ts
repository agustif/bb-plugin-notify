import type { NotifyLevel } from "./schemas.js";
import { isWithinQuietHours, parseQuietHours, type QuietHours } from "./quiet-hours.js";

/** Non-error notifications are suppressed inside quiet hours; error always delivers. */
export function shouldSuppressForQuietHours(
  quiet: QuietHours,
  level: NotifyLevel,
  now: Date = new Date(),
): boolean {
  if (level === "error") return false;
  return isWithinQuietHours(quiet, now);
}

export function quietHoursFromSetting(
  raw: string | undefined | null,
): QuietHours {
  return parseQuietHours(raw);
}
