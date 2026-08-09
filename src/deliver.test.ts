import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliverNotification } from "./deliver.js";
import type { BbPluginApi } from "@bb/plugin-sdk";
import type { NotificationRecord } from "./schemas.js";

function mockBb(opts?: { failRealtime?: boolean }) {
  const published: Array<{ channel: string; payload: unknown }> = [];
  const logs: string[] = [];
  const bb = {
    realtime: {
      publish(channel: string, payload: unknown) {
        if (opts?.failRealtime) throw new Error("ws down");
        published.push({ channel, payload });
      },
    },
    log: {
      info: (m: string) => logs.push(m),
      warn: (m: string) => logs.push(m),
      error: (m: string) => logs.push(m),
    },
  } as unknown as BbPluginApi;
  return { bb, published, logs };
}

function mockStore() {
  const items: NotificationRecord[] = [];
  return {
    items,
    async listRecent() {
      return items.slice();
    },
    async push(record: NotificationRecord) {
      items.unshift(record);
    },
  };
}

describe("deliverNotification", () => {
  it("publishes toast realtime payload", async () => {
    const { bb, published } = mockBb();
    const store = mockStore();
    const result = await deliverNotification({
      bb,
      store,
      settings: {
        webhookUrl: undefined,
        quietHours: "",
        defaultChannel: "toast",
      },
      input: { title: "Hello", body: "world", level: "info" },
      threadId: "thr_1",
      projectId: "proj_1",
    });
    assert.equal(result.delivered, true);
    assert.equal(result.channel, "toast");
    assert.equal(published.length, 2); // notification + list-changed
    const note = published[0]!.payload as { kind: string; title: string };
    assert.equal(note.kind, "notification");
    assert.equal(note.title, "Hello");
    assert.equal(store.items.length, 1);
    assert.equal(store.items[0]!.delivered, true);
  });

  it("suppresses toast during quiet hours except error", async () => {
    const { bb, published } = mockBb();
    const store = mockStore();
    // Force "now" into an overnight quiet window.
    const night = new Date(2026, 0, 15, 23, 0, 0, 0);
    const suppressed = await deliverNotification({
      bb,
      store,
      settings: {
        webhookUrl: undefined,
        quietHours: "22:00-08:00",
        defaultChannel: "toast",
      },
      input: { title: "Shh", body: "", level: "info" },
      threadId: null,
      projectId: null,
      now: night,
    });
    assert.equal(suppressed.suppressed, true);
    assert.equal(suppressed.reason, "quiet_hours");
    // list-changed still fires; notification does not
    assert.equal(
      published.filter(
        (p) => (p.payload as { kind?: string }).kind === "notification",
      ).length,
      0,
    );

    const err = await deliverNotification({
      bb,
      store,
      settings: {
        webhookUrl: undefined,
        quietHours: "22:00-08:00",
        defaultChannel: "toast",
      },
      input: { title: "Boom", body: "", level: "error" },
      threadId: null,
      projectId: null,
      now: night,
    });
    assert.equal(err.delivered, true);
    assert.equal(err.suppressed, false);
  });

  it("posts webhook when configured", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    let posted: unknown = null;
    const fetchImpl: typeof fetch = async (_url, init) => {
      posted = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    };
    const result = await deliverNotification({
      bb,
      store,
      settings: {
        webhookUrl: "https://hooks.example.com/n",
        quietHours: "",
        defaultChannel: "toast",
      },
      input: {
        title: "Ship it",
        body: "done",
        level: "success",
        channel: "webhook",
      },
      threadId: "thr_x",
      projectId: null,
      fetchImpl,
    });
    assert.equal(result.delivered, true);
    assert.equal(result.channel, "webhook");
    assert.equal((posted as { title: string }).title, "Ship it");
    assert.equal((posted as { source: string }).source, "bb-plugin-notify");
  });

  it("suppresses webhook when not configured", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    const result = await deliverNotification({
      bb,
      store,
      settings: {
        webhookUrl: undefined,
        quietHours: "",
        defaultChannel: "webhook",
      },
      input: { title: "Nope", body: "", level: "info" },
      threadId: null,
      projectId: null,
    });
    assert.equal(result.suppressed, true);
    assert.equal(result.reason, "webhook_not_configured");
  });

  it("rejects invalid webhook URL", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    const result = await deliverNotification({
      bb,
      store,
      settings: {
        webhookUrl: "ftp://bad",
        quietHours: "",
        defaultChannel: "webhook",
      },
      input: { title: "Bad", body: "", level: "info", channel: "webhook" },
      threadId: null,
      projectId: null,
    });
    assert.equal(result.suppressed, true);
    assert.equal(result.reason, "webhook_url_invalid");
  });
});
