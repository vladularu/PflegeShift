import { describe, expect, it } from "vitest";
import type { ComplianceIssue, ShiftEntry } from "@/domain/types";
import { complianceTimeline, restDuration } from "./compliance-timeline";
const shift = (change: Partial<ShiftEntry> = {}): ShiftEntry => ({
  kind: "SHIFT",
  id: "late",
  templateId: null,
  date: "2026-11-30",
  title: "Spät",
  type: "LATE",
  startTime: "13:18",
  endTime: "21:30",
  breakMinutes: 30,
  color: "#227766",
  symbol: "S",
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  deletedAt: null,
  ...change,
});
const late = shift();
const early = shift({
  id: "early",
  date: "2026-12-01",
  title: "Früh",
  type: "EARLY",
  startTime: "07:00",
  endTime: "15:12",
});
const issue = (change: Partial<ComplianceIssue> = {}): ComplianceIssue => ({
  id: "rest",
  date: "2026-12-01",
  kind: "LEGAL",
  severity: "critical",
  rule: "ARBZG_5_REST_10H",
  title: "Ruhezeit unter 10 Stunden",
  description:
    "Zwischen den Diensten liegen nur 9.5 h Ruhezeit. Damit wird auch die für Krankenhäuser und Pflegeeinrichtungen mögliche Verkürzung auf 10 Stunden unterschritten.",
  relatedShiftIds: [late.id, early.id],
  ...change,
});
const model = (
  finding = issue(),
  shifts: readonly ShiftEntry[] = [early, late],
  timeZone = "Europe/Berlin",
) => complianceTimeline(finding, shifts, timeZone);

describe("check timeline presentation", () => {
  it("shows exact end, next start and elapsed gap independent of input order", () => {
    const result = model();
    expect(result.rest).toMatchObject({
      previous: late,
      next: early,
      minutes: 570,
      endDate: "2026-11-30",
      startDate: "2026-12-01",
    });
    expect(restDuration(result.rest!.minutes)).toBe("9:30 h");
    expect(result.title).toBe("Ruhezeit zu kurz");
    expect(result.note).toBe("Mindestens 10 Std. Ruhezeit nötig.");
  });
  it("uses the next day as the endpoint of an overnight shift", () => {
    const night = shift({ id: "night", date: "2026-08-04", startTime: "21:00", endTime: "07:30" });
    const next = shift({ id: "next", date: "2026-08-05" });
    expect(
      model(issue({ relatedShiftIds: [next.id, night.id] }), [next, night]).rest,
    ).toMatchObject({ endDate: "2026-08-05", startDate: "2026-08-05", minutes: 348 });
    expect(restDuration(348)).toBe("5:48 h");
  });
  it.each([
    ["2026-03-28", "2026-03-29", 510],
    ["2026-10-24", "2026-10-25", 630],
  ])("uses elapsed time over the clock change on %s", (from, until, minutes) => {
    expect(model(issue(), [shift({ date: from }), { ...early, date: until }]).rest?.minutes).toBe(
      minutes,
    );
  });
  it("uses the selected profile timezone rather than a fixed device timezone", () => {
    const shifts = [shift({ date: "2026-03-28" }), { ...early, date: "2026-03-29" }];
    expect(model(issue(), shifts, "UTC").rest?.minutes).toBe(570);
  });
  it("keeps dates correct across the year boundary", () => {
    const shifts = [
      shift({ date: "2026-12-31", startTime: "21:00", endTime: "07:30" }),
      { ...early, date: "2027-01-01", startTime: "13:18" },
    ];
    expect(model(issue(), shifts).rest).toMatchObject({
      endDate: "2027-01-01",
      startDate: "2027-01-01",
      minutes: 348,
    });
  });
  it.each(
    [
      [early],
      [late, { ...early, deletedAt: "2026-12-01" }],
      [late, { ...early, allDay: true }],
      [late, { ...early, startTime: null }],
      [late, { ...early, date: "invalid" }],
      [late, { ...early, date: late.date, startTime: "15:00" }],
    ].map((shifts) => ({ shifts })),
  )(
    "never invents a rest duration from missing, invalid, all-day or overlapping shifts",
    ({ shifts }) => {
      expect(model(issue(), shifts).rest).toBeNull();
    },
  );
  it("preserves the compensation duration and deadline directly", () => {
    const finding = issue({
      rule: "ARBZG_5_REST_11H",
      title: "Ausgleich für verkürzte Ruhezeit offen",
      description:
        "Die Ruhezeit beträgt 10.5 h. In den eingetragenen Diensten wurde bis 06.09.2026 keine noch unbenutzte Ruhezeit von mindestens 12 Stunden als Ausgleich erkannt.",
    });
    expect(model(finding).note).toBe("Ausgleich: mindestens 12 Std. Ruhezeit bis 06.09.2026.");
    expect(model(finding).title).toBe(finding.title);
  });
  it("retains unfamiliar extra conditions in full and does not mutate the finding", () => {
    const finding = Object.freeze(
      issue({ description: issue().description + " Eine zusätzliche Bedingung ist offen." }),
    );
    expect(model(finding).note).toBe(finding.description);
    expect(finding.title).toBe("Ruhezeit unter 10 Stunden");
  });
  it("keeps the youth minimum alongside the same exact timeline", () => {
    const finding = issue({
      rule: "JARBSCHG_13_REST",
      title: "Weniger als 12 Stunden Ruhezeit",
      description:
        "Zwischen diesen Arbeitstagen liegen 9,5 Stunden. Jugendliche brauchen mindestens 12 zusammenhängende Stunden Freizeit (§ 13).",
    });
    expect(model(finding).note).toBe("Jugendliche brauchen mindestens 12 Std. Ruhezeit.");
    expect(model(finding).rest?.minutes).toBe(570);
  });
  const seriesShifts = Array.from({ length: 12 }, (_, index) =>
    shift({ id: `day-${index}`, date: `2026-11-${String(index + 19).padStart(2, "0")}` }),
  );
  const series = issue({
    rule: "PLANNING_7_DAYS",
    kind: "PLANNING",
    description: "12 aufeinanderfolgende Arbeitstage wurden erkannt.",
    relatedShiftIds: seriesShifts.map((s) => s.id),
  });
  it("takes the series count from the engine, with an independently verified date range", () => {
    expect(model(series, seriesShifts).series).toEqual({
      count: 12,
      unit: "Arbeitstage",
      from: "2026-11-19",
      until: "2026-11-30",
    });
    const duplicateDay = { ...seriesShifts[0], id: "second-shift" };
    expect(
      model({ ...series, relatedShiftIds: [...series.relatedShiftIds, duplicateDay.id] }, [
        ...seriesShifts,
        duplicateDay,
      ]).series?.count,
    ).toBe(12);
  });
  it("keeps the authoritative count without fabricating a range from a partial list", () => {
    const result = model(series, seriesShifts.slice(1));
    expect(result.series).toEqual({ count: 12, unit: "Arbeitstage", from: null, until: null });
    expect(result.missing).toBe(true);
  });
  it("requires consecutive valid dates before showing a complete series range", () => {
    const result = model(
      series,
      seriesShifts.map((s, i) => (i === 0 ? { ...s, date: "2026-11-01" } : s)),
    );
    expect(result.series?.from).toBeNull();
  });
  it("preserves changed series descriptions as a fallback rather than hiding added conditions", () => {
    const finding = { ...series, description: series.description + " Ausgleich prüfen." };
    expect(model(finding, seriesShifts).series).toBeNull();
    expect(model(finding, seriesShifts).note).toBe(finding.description);
  });
});
