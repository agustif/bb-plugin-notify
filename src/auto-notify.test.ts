import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BbPluginApi } from "@bb/plugin-sdk";
import { handleWorkerFailed, handleWorkerIdle } from "./auto-notify.js";
import type { NotificationRecord } from "./schemas.js";
import type { NotifySettings } from "./deliver.js";

function mockBb() {
  const published: Array<{ channel: string; payload: unknown }> = [];
  const bb = {
    realtime: {
      publish(channel: string, payload: unknown) {
        published.push({ channel, payload });
      },
    },
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  } as unknown as BbPluginApi;
  return { bb, published };
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

const baseSettings: NotifySettings = {
  webhookUrl: undefined,
  quietHours: "",
  defaultChannel: "toast",
  showHeaderBadge: true,
  autoNotifyOnWorkerDone: true,
  autoNotifyOnWorkerFail: true,
};

describe("handleWorkerIdle", () => {
  it("delivers success for todo worker titles", async () => {
    const { bb, published } = mockBb();
    const store = mockStore();
    const result = await handleWorkerIdle({
      bb,
      store,
      settings: baseSettings,
      thread: {
        id: "thr_w",
        projectId: "proj_1",
        title: "[Worker:api] Build routes",
      },
      lastAssistantText: "Routes landed.",
    });
    assert.equal(result.skipped, false);
    assert.equal(store.items.length, 1);
    assert.equal(store.items[0]!.level, "success");
    assert.match(store.items[0]!.title, /^Worker done:/);
    assert.equal(store.items[0]!.body, "Routes landed.");
    assert.ok(published.some((p) => (p.payload as { kind?: string }).kind === "notification"));
  });

  it("uses Reviewer/Scout role in the title", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    const review = await handleWorkerIdle({
      bb,
      store,
      settings: baseSettings,
      thread: {
        id: "thr_r",
        title: "[Reviewer:session-goal.review] Review goal card density",
      },
      lastAssistantText: "## Review\n\n**request-changes**",
    });
    assert.equal(review.skipped, false);
    assert.match(store.items[0]!.title, /^Reviewer done:/);
    assert.match(store.items[0]!.body, /\*\*request-changes\*\*/);

    const scout = await handleWorkerIdle({
      bb,
      store,
      settings: baseSettings,
      thread: {
        id: "thr_s",
        title: "[Scout:map] Explore",
      },
      lastAssistantText: "found things",
    });
    assert.equal(scout.skipped, false);
    assert.match(store.items[0]!.title, /^Scout done:/);
  });

  it("skips non-workers", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    const result = await handleWorkerIdle({
      bb,
      store,
      settings: baseSettings,
      thread: { id: "thr_1", title: "Main thread" },
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "not_todo_worker");
    assert.equal(store.items.length, 0);
  });

  it("respects autoNotifyOnWorkerDone off", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    const result = await handleWorkerIdle({
      bb,
      store,
      settings: { ...baseSettings, autoNotifyOnWorkerDone: false },
      thread: {
        id: "thr_w",
        title: "[Worker:x] work",
        originPluginId: "todo",
      },
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "autoNotifyOnWorkerDone_off");
  });
});

describe("handleWorkerFailed", () => {
  it("delivers error for originPluginId todo", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    const result = await handleWorkerFailed({
      bb,
      store,
      settings: baseSettings,
      thread: {
        id: "thr_f",
        projectId: "proj_1",
        title: "Custom agent",
        originPluginId: "todo",
      },
      error: "provider timeout",
    });
    assert.equal(result.skipped, false);
    assert.equal(store.items[0]!.level, "error");
    assert.match(store.items[0]!.title, /^Worker failed:/);
    assert.equal(store.items[0]!.body, "provider timeout");
  });

  it("uses role-aware failed title for Reviewer", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    const result = await handleWorkerFailed({
      bb,
      store,
      settings: baseSettings,
      thread: {
        id: "thr_f",
        title: "[Reviewer:x] Review",
      },
      error: "boom",
    });
    assert.equal(result.skipped, false);
    assert.match(store.items[0]!.title, /^Reviewer failed:/);
  });

  it("respects autoNotifyOnWorkerFail off", async () => {
    const { bb } = mockBb();
    const store = mockStore();
    const result = await handleWorkerFailed({
      bb,
      store,
      settings: { ...baseSettings, autoNotifyOnWorkerFail: false },
      thread: {
        id: "thr_f",
        title: "[Scout:x] explore",
      },
      error: "boom",
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "autoNotifyOnWorkerFail_off");
  });

  it("error still delivers during quiet hours", async () => {
    const { bb, published } = mockBb();
    const store = mockStore();
    const night = new Date(2026, 0, 15, 23, 0, 0, 0);
    const result = await handleWorkerFailed({
      bb,
      store,
      settings: {
        ...baseSettings,
        quietHours: "22:00-08:00",
      },
      thread: {
        id: "thr_f",
        title: "[Worker:x] work",
      },
      error: "crash",
      now: night,
    });
    assert.equal(result.skipped, false);
    assert.equal(store.items[0]!.level, "error");
    assert.equal(store.items[0]!.delivered, true);
    assert.equal(store.items[0]!.suppressed, false);
    assert.ok(
      published.some(
        (p) => (p.payload as { kind?: string }).kind === "notification",
      ),
    );
  });

  it("success is suppressed during quiet hours", async () => {
    const { bb, published } = mockBb();
    const store = mockStore();
    const night = new Date(2026, 0, 15, 23, 0, 0, 0);
    const result = await handleWorkerIdle({
      bb,
      store,
      settings: {
        ...baseSettings,
        quietHours: "22:00-08:00",
      },
      thread: {
        id: "thr_w",
        title: "[Worker:x] work",
      },
      lastAssistantText: "done",
      now: night,
    });
    assert.equal(result.skipped, false);
    assert.equal(store.items[0]!.suppressed, true);
    assert.equal(store.items[0]!.reason, "quiet_hours");
    assert.equal(
      published.filter(
        (p) => (p.payload as { kind?: string }).kind === "notification",
      ).length,
      0,
    );
  });
});
