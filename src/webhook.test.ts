import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidWebhookUrl, normalizeWebhookUrl } from "./webhook.js";
import { postWebhook } from "./deliver.js";

describe("normalizeWebhookUrl", () => {
  it("accepts https and http", () => {
    assert.equal(
      normalizeWebhookUrl("https://hooks.example.com/x"),
      "https://hooks.example.com/x",
    );
    assert.equal(
      normalizeWebhookUrl("http://127.0.0.1:9999/hook"),
      "http://127.0.0.1:9999/hook",
    );
  });

  it("rejects empty, bad schemes, and embedded credentials", () => {
    assert.equal(normalizeWebhookUrl(""), null);
    assert.equal(normalizeWebhookUrl("ftp://x"), null);
    assert.equal(normalizeWebhookUrl("not a url"), null);
    assert.equal(normalizeWebhookUrl("https://user:pass@host/x"), null);
    assert.equal(isValidWebhookUrl("javascript:alert(1)"), false);
  });
});

describe("postWebhook", () => {
  it("posts JSON and reports ok", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(null, { status: 204 });
    };
    const result = await postWebhook(
      "https://example.com/hook",
      { title: "hi" },
      fetchImpl,
    );
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://example.com/hook");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(
      (calls[0]!.init.headers as Record<string, string>)["content-type"],
      "application/json",
    );
    assert.equal(calls[0]!.init.body, JSON.stringify({ title: "hi" }));
  });

  it("surfaces non-2xx", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("nope", { status: 500 });
    const result = await postWebhook("https://example.com/hook", {}, fetchImpl);
    assert.equal(result.ok, false);
    assert.match(result.detail, /HTTP 500/);
  });

  it("surfaces network failure", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await postWebhook("https://example.com/hook", {}, fetchImpl);
    assert.equal(result.ok, false);
    assert.match(result.detail, /ECONNREFUSED/);
  });
});
