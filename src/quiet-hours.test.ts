import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWithinQuietHours, parseQuietHours } from "./quiet-hours.js";
import { shouldSuppressForQuietHours } from "./suppress.js";

function at(h: number, m = 0): Date {
  const d = new Date(2026, 0, 15, h, m, 0, 0);
  return d;
}

describe("parseQuietHours", () => {
  it("disables on empty", () => {
    assert.deepEqual(parseQuietHours(""), { enabled: false });
    assert.deepEqual(parseQuietHours("   "), { enabled: false });
    assert.deepEqual(parseQuietHours(null), { enabled: false });
  });

  it("parses same-day window", () => {
    assert.deepEqual(parseQuietHours("09:00-17:00"), {
      enabled: true,
      startMinutes: 9 * 60,
      endMinutes: 17 * 60,
    });
  });

  it("parses overnight window", () => {
    assert.deepEqual(parseQuietHours("22:00-08:00"), {
      enabled: true,
      startMinutes: 22 * 60,
      endMinutes: 8 * 60,
    });
  });

  it("rejects equal endpoints and garbage", () => {
    assert.deepEqual(parseQuietHours("10:00-10:00"), { enabled: false });
    assert.deepEqual(parseQuietHours("nope"), { enabled: false });
    assert.deepEqual(parseQuietHours("25:00-26:00"), { enabled: false });
  });
});

describe("isWithinQuietHours", () => {
  const day = parseQuietHours("09:00-17:00");
  const night = parseQuietHours("22:00-08:00");

  it("handles same-day range", () => {
    assert.equal(isWithinQuietHours(day, at(8, 59)), false);
    assert.equal(isWithinQuietHours(day, at(9, 0)), true);
    assert.equal(isWithinQuietHours(day, at(16, 59)), true);
    assert.equal(isWithinQuietHours(day, at(17, 0)), false);
  });

  it("handles overnight range", () => {
    assert.equal(isWithinQuietHours(night, at(21, 59)), false);
    assert.equal(isWithinQuietHours(night, at(22, 0)), true);
    assert.equal(isWithinQuietHours(night, at(23, 30)), true);
    assert.equal(isWithinQuietHours(night, at(0, 0)), true);
    assert.equal(isWithinQuietHours(night, at(7, 59)), true);
    assert.equal(isWithinQuietHours(night, at(8, 0)), false);
  });

  it("disabled is never quiet", () => {
    assert.equal(isWithinQuietHours({ enabled: false }, at(3)), false);
  });
});

describe("shouldSuppressForQuietHours", () => {
  const night = parseQuietHours("22:00-08:00");

  it("suppresses non-error inside quiet hours", () => {
    assert.equal(shouldSuppressForQuietHours(night, "info", at(23)), true);
    assert.equal(shouldSuppressForQuietHours(night, "success", at(23)), true);
    assert.equal(shouldSuppressForQuietHours(night, "warning", at(23)), true);
  });

  it("never suppresses error", () => {
    assert.equal(shouldSuppressForQuietHours(night, "error", at(23)), false);
  });

  it("does not suppress outside quiet hours", () => {
    assert.equal(shouldSuppressForQuietHours(night, "info", at(12)), false);
  });
});
