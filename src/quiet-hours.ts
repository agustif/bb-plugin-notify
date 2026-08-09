/**
 * Quiet hours: "HH:MM-HH:MM" in the server's local timezone.
 * Empty / whitespace = disabled. Spans may cross midnight (e.g. 22:00-08:00).
 */

export type QuietHours =
  | { enabled: false }
  | { enabled: true; startMinutes: number; endMinutes: number };

function parseHm(token: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(token.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function parseQuietHours(raw: string | undefined | null): QuietHours {
  const text = (raw ?? "").trim();
  if (!text) return { enabled: false };
  const parts = text.split("-");
  if (parts.length !== 2) return { enabled: false };
  const startMinutes = parseHm(parts[0]!);
  const endMinutes = parseHm(parts[1]!);
  if (startMinutes === null || endMinutes === null) return { enabled: false };
  if (startMinutes === endMinutes) return { enabled: false };
  return { enabled: true, startMinutes, endMinutes };
}

export function isWithinQuietHours(
  quiet: QuietHours,
  now: Date = new Date(),
): boolean {
  if (!quiet.enabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const { startMinutes, endMinutes } = quiet;
  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }
  // Crosses midnight: e.g. 22:00-08:00
  return minutes >= startMinutes || minutes < endMinutes;
}
