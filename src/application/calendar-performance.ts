/** Opt-in, bounded numeric diagnostics. No domain objects or free text are accepted. */
const kinds = [
  "request-month",
  "request-year",
  "request-year-step",
  "request-today",
  "scroll-begin",
  "scroll-end",
  "expand",
  "index",
  "load-start",
  "load-end",
  "load-discard",
  "load-error",
  "commit",
  "pager-layout",
  "prepare",
  "measure",
  "plan-ready",
  "animation-start",
  "animation-end",
  "fallback",
  "effect-cleanup",
  "ui-frames",
] as const;
export type CalendarPerformanceKind = (typeof kinds)[number];
const fields = [
  "duration",
  "input",
  "output",
  "series",
  "month",
  "height",
  "width",
  "mode",
  "round",
  "nodes",
  "valid",
  "load",
  "full",
  "epoch",
  "count",
  "maximum",
  "over17",
  "over34",
  "over50",
] as const;
export type CalendarPerformanceValues = Partial<Record<(typeof fields)[number], number>>;
export function createCalendarPerformanceRecorder(now: () => number = () => performance.now()) {
  let session = 0,
    serial = 0,
    request = 0,
    started = 0,
    dropped = 0;
  const events: {
    t: number;
    request: number;
    kind: CalendarPerformanceKind;
    values: CalendarPerformanceValues;
  }[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const stop = () => {
    session = 0;
    notify();
  };
  const active = () => {
    if (session && now() - started >= 600_000) stop();
    return session;
  };
  const record = (
    kind: CalendarPerformanceKind,
    values: CalendarPerformanceValues = {},
    expected = session,
    requestId = request,
  ) => {
    if (!active() || expected !== session || !kinds.includes(kind)) return;
    const clean: CalendarPerformanceValues = {};
    for (const field of fields) {
      const value = values[field];
      if (typeof value === "number" && Number.isFinite(value))
        clean[field] = Math.round(value * 100) / 100;
    }
    if (events.length === 2000) {
      events.shift();
      dropped++;
    }
    events.push({
      t: Math.round((now() - started) * 100) / 100,
      request: requestId,
      kind,
      values: clean,
    });
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => session,
    start: (allowed: boolean) => {
      if (!allowed) return;
      events.length = 0;
      dropped = 0;
      request = 0;
      started = now();
      session = ++serial;
      notify();
    },
    stop,
    clear: () => {
      stop();
      events.length = 0;
      dropped = 0;
    },
    record,
    begin: (kind: CalendarPerformanceKind, month?: string) => {
      if (!active()) return;
      request++;
      record(
        kind,
        month && /^\d{4}-\d{2}$/.test(month) ? { month: Number(month.replace("-", "")) } : {},
      );
    },
    span: (kind: CalendarPerformanceKind, values: CalendarPerformanceValues = {}) => {
      const id = active(),
        owner = request,
        start = id ? now() : 0;
      return (result: CalendarPerformanceValues = {}) => {
        if (id) record(kind, { ...values, ...result, duration: now() - start }, id, owner);
      };
    },
    report: () => ({
      schema: 1,
      baseline: "e3d89d7",
      sessionSerial: serial,
      dropped,
      events: events.map((event) => ({ ...event, values: { ...event.values } })),
      limits:
        "Local numeric data only; JS handler time is not physical touch time. Commit marks are not React render duration. UI callback intervals are not GPU FPS; partial final frame windows are omitted. Instrumentation adds overhead. Maximum 2000 events / 10 minutes; no persistence across restart.",
    }),
  };
}
export const calendarPerformance = createCalendarPerformanceRecorder();
