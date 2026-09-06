import { describe, it, expect } from "vitest";
import { createCalendarPerformanceRecorder } from "./calendar-performance";

describe("calendar performance recorder", () => {
  it("is opt-in and rejects unapproved starts", () => {
    const r = createCalendarPerformanceRecorder();
    r.start(false);
    r.record("commit");
    expect(r.report().events).toEqual([]);
    expect(r.getSnapshot()).toBe(0);
  });
  it("whitelists finite numeric fields and never serializes arbitrary payloads", () => {
    const r = createCalendarPerformanceRecorder(() => 50);
    r.start(true);
    r.record("expand", { duration: 2, input: Infinity, title: "private", salary: 9999 } as never);
    r.record("private-name" as never);
    r.begin("request-month", "private-name");
    const json = JSON.stringify(r.report());
    expect(json).not.toContain("private");
    expect(json).not.toContain("9999");
    expect(r.report().events[0].values).toEqual({ duration: 2 });
  });
  it("bounds memory and expires at ten minutes", () => {
    let t = 0;
    const r = createCalendarPerformanceRecorder(() => t);
    r.start(true);
    for (let i = 0; i < 2100; i++) r.record("commit");
    expect(r.report().events).toHaveLength(2000);
    expect(r.report().dropped).toBe(100);
    t = 600001;
    r.record("commit");
    expect(r.getSnapshot()).toBe(0);
  });
  it("times spans and ignores stale results after restart or stop", () => {
    let t = 100;
    const r = createCalendarPerformanceRecorder(() => t);
    r.start(true);
    r.begin("request-month", "2026-01");
    const finish = r.span("expand", { input: 1 });
    t = 125;
    finish({ output: 2 });
    expect(r.report().events[1]).toMatchObject({
      request: 1,
      values: { duration: 25, input: 1, output: 2 },
    });
    const stale = r.span("load-end");
    r.start(true);
    stale();
    expect(r.report().events).toEqual([]);
    r.stop();
    r.record("commit");
    expect(r.report().events).toEqual([]);
    r.clear();
    expect(r.report().events).toEqual([]);
  });
});
