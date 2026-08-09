import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTodoDispatchedWorker,
  workerDisplayTitle,
  workerRoleLabel,
} from "./worker-detect.js";

describe("isTodoDispatchedWorker", () => {
  it("matches title-cased role prefixes from todo dispatch", () => {
    assert.equal(
      isTodoDispatchedWorker({
        title: "[Worker:notify.hook] Hook todo child idle/fail",
      }),
      true,
    );
    assert.equal(
      isTodoDispatchedWorker({ title: "[Scout:map] Explore APIs" }),
      true,
    );
    assert.equal(
      isTodoDispatchedWorker({ title: "[Reviewer:pr] Review PR" }),
      true,
    );
  });

  it("matches lowercase prefixes", () => {
    assert.equal(
      isTodoDispatchedWorker({ title: "[worker:x] work" }),
      true,
    );
  });

  it("matches originPluginId todo even without role prefix", () => {
    assert.equal(
      isTodoDispatchedWorker({
        title: "Custom worker task",
        originPluginId: "todo",
      }),
      true,
    );
  });

  it("rejects ordinary threads", () => {
    assert.equal(
      isTodoDispatchedWorker({ title: "Ship the feature" }),
      false,
    );
    assert.equal(
      isTodoDispatchedWorker({
        title: "[Self:plan] Orchestrate",
        originPluginId: null,
      }),
      false,
    );
    assert.equal(
      isTodoDispatchedWorker({
        title: "Something",
        originPluginId: "github",
      }),
      false,
    );
  });
});

describe("workerRoleLabel", () => {
  it("maps known role prefixes", () => {
    assert.equal(
      workerRoleLabel({
        title: "[Worker:notify.hook] Hook todo child",
      }),
      "Worker",
    );
    assert.equal(
      workerRoleLabel({ title: "[Scout:map] Explore APIs" }),
      "Scout",
    );
    assert.equal(
      workerRoleLabel({
        title: "[Reviewer:session-goal.review] Review goal card",
      }),
      "Reviewer",
    );
    assert.equal(
      workerRoleLabel({ title: "[reviewer:x] lower" }),
      "Reviewer",
    );
  });

  it("keeps custom role labels", () => {
    assert.equal(
      workerRoleLabel({ title: "[Docs:note] Write docs" }),
      "Docs",
    );
  });

  it("falls back when no prefix", () => {
    assert.equal(
      workerRoleLabel({
        title: "Custom worker task",
        originPluginId: "todo",
      }),
      "Worker",
    );
  });
});

describe("workerDisplayTitle", () => {
  it("prefers title, then fallback, then id", () => {
    assert.equal(
      workerDisplayTitle({
        id: "thr_1",
        title: "A",
        titleFallback: "B",
      }),
      "A",
    );
    assert.equal(
      workerDisplayTitle({
        id: "thr_1",
        title: null,
        titleFallback: "B",
      }),
      "B",
    );
    assert.equal(
      workerDisplayTitle({
        id: "thr_1",
        title: null,
        titleFallback: null,
      }),
      "thr_1",
    );
  });
});
