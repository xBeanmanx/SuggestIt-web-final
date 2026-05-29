// ============================================================
// SuggestIt - Cookie Monitor Tests
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setCookie,
  getCookie,
  deleteCookie,
  ActivityMonitor,
} from "../../src/utils/cookieMonitor"; // adjust path once file is placed

// ── jsdom cookie store stub ────────────────────────────────
// vitest/jsdom provides a real document.cookie implementation,
// so these tests run against the actual jsdom cookie jar.

beforeEach(() => {
  // Clear all cookies between tests by expiring them
  document.cookie.split(";").forEach((c) => {
    const name = c.trim().split("=")[0];
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
});

// ── setCookie / getCookie / deleteCookie ───────────────────

describe("setCookie / getCookie", () => {
  it("sets and retrieves a cookie", () => {
    setCookie("test_key", "hello");
    expect(getCookie("test_key")).toBe("hello");
  });

  it("returns null for a missing cookie", () => {
    expect(getCookie("nonexistent")).toBeNull();
  });

  it("URL-encodes special characters in name and value", () => {
    setCookie("my key", "a=b&c=d");
    expect(getCookie("my key")).toBe("a=b&c=d");
  });

  it("overwrites an existing cookie", () => {
    setCookie("k", "first");
    setCookie("k", "second");
    expect(getCookie("k")).toBe("second");
  });
});

describe("deleteCookie", () => {
  it("removes a cookie that was previously set", () => {
    setCookie("to_delete", "value");
    deleteCookie("to_delete");
    expect(getCookie("to_delete")).toBeNull();
  });

  it("does not throw when deleting a non-existent cookie", () => {
    expect(() => deleteCookie("ghost")).not.toThrow();
  });
});

// ── ActivityMonitor - page visits ─────────────────────────

describe("ActivityMonitor.recordPageVisit", () => {
  let monitor: ActivityMonitor;

  beforeEach(() => {
    monitor = new ActivityMonitor();
  });

  it("records the last visited page", () => {
    monitor.recordPageVisit("groups");
    expect(monitor.getLastVisited()).toBe("groups");
  });

  it("updates last visited on subsequent calls", () => {
    monitor.recordPageVisit("groups");
    monitor.recordPageVisit("statistics");
    expect(monitor.getLastVisited()).toBe("statistics");
  });

  it("increments visit count on each call", () => {
    monitor.recordPageVisit("groups");
    monitor.recordPageVisit("groups");
    expect(monitor.getVisitCount("groups")).toBe(2);
  });

  it("tracks multiple pages independently", () => {
    monitor.recordPageVisit("groups");
    monitor.recordPageVisit("statistics");
    monitor.recordPageVisit("groups");
    expect(monitor.getVisitCount("groups")).toBe(2);
    expect(monitor.getVisitCount("statistics")).toBe(1);
  });

  it("returns 0 for an unvisited page", () => {
    expect(monitor.getVisitCount("never_visited")).toBe(0);
  });

  it("returns null for lastVisited when no visits recorded", () => {
    expect(monitor.getLastVisited()).toBeNull();
  });

  it("updates lastActiveAt timestamp", () => {
    const before = Date.now();
    monitor.recordPageVisit("groups");
    const after = Date.now();
    const ts = new Date(monitor.getLastActiveAt()!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("returns null for lastActiveAt when no activity", () => {
    expect(monitor.getLastActiveAt()).toBeNull();
  });

  it("getAllVisitCounts returns all recorded pages", () => {
    monitor.recordPageVisit("groups");
    monitor.recordPageVisit("statistics");
    const counts = monitor.getAllVisitCounts();
    expect(counts["groups"]).toBe(1);
    expect(counts["statistics"]).toBe(1);
  });
});

// ── ActivityMonitor - preferences ─────────────────────────

describe("ActivityMonitor preferences", () => {
  let monitor: ActivityMonitor;

  beforeEach(() => {
    monitor = new ActivityMonitor();
  });

  it("sets and gets a preference", () => {
    monitor.setPreference("theme", "dark");
    expect(monitor.getPreference("theme")).toBe("dark");
  });

  it("overwrites an existing preference", () => {
    monitor.setPreference("theme", "dark");
    monitor.setPreference("theme", "light");
    expect(monitor.getPreference("theme")).toBe("light");
  });

  it("returns null for a missing preference", () => {
    expect(monitor.getPreference("missing")).toBeNull();
  });

  it("stores multiple preferences independently", () => {
    monitor.setPreference("theme", "dark");
    monitor.setPreference("language", "en");
    expect(monitor.getPreference("theme")).toBe("dark");
    expect(monitor.getPreference("language")).toBe("en");
  });

  it("clears a single preference", () => {
    monitor.setPreference("theme", "dark");
    monitor.setPreference("language", "en");
    monitor.clearPreference("theme");
    expect(monitor.getPreference("theme")).toBeNull();
    expect(monitor.getPreference("language")).toBe("en");
  });
});

// ── ActivityMonitor - clearAll ─────────────────────────────

describe("ActivityMonitor.clearAll", () => {
  it("clears all activity and preferences", () => {
    const monitor = new ActivityMonitor();
    monitor.recordPageVisit("groups");
    monitor.setPreference("theme", "dark");
    monitor.clearAll();
    expect(monitor.getLastVisited()).toBeNull();
    expect(monitor.getPreference("theme")).toBeNull();
  });
});
