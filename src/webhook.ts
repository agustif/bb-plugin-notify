/**
 * Webhook URL helpers for the notify plugin.
 * Allows http(s) only; rejects credentials-in-URL and non-http schemes.
 */

export function normalizeWebhookUrl(
  raw: string | undefined | null,
): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url.toString();
}

export function isValidWebhookUrl(raw: string | undefined | null): boolean {
  return normalizeWebhookUrl(raw) !== null;
}
