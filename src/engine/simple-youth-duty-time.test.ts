import { describe, expect, it } from "vitest";
import type { ShiftEntry } from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";
function shift(
  date: string,
  startTime = "07:00",
  endTime = "16:00",
  breakMinutes = 60,
  id = date,
): ShiftEntry {
  return {
    kind: "SHIFT",
    id,
    date,
    templateId: null,
    title: "Dienst",
    type: "DAY",
    startTime,
    endTime,
    breakMinutes,
    color: "#123456",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
  };
}
const options = {
  federalState: "HE" as const,
  holidayRegion: "NONE" as const,
  youthProtection: true,
  referenceDate: "2026-10-05",
  allEmploymentWorkRecorded: true,
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
};
const run = (shifts: readonly ShiftEntry[], month = "2026-10") =>
  calculateMonthlyCompliance(month, shifts, "Europe/Berlin", options);
const findings = (shifts: readonly ShiftEntry[], rule: string, month?: string) =>
  run(shifts, month).issues.filter((item) => item.rule === rule);
describe("simple opt-in youth duty checks", () => {
  it("preserves the complete original adult result while off", () => {
    const shifts = [shift("2026-10-01", "21:00", "07:00", 30)];
    expect(
      calculateMonthlyCompliance("2026-10", shifts, "Europe/Berlin", {
        ...options,
        youthProtection: false,
      }),
    ).toEqual(
      calculateMonthlyCompliance("2026-10", shifts, "Europe/Berlin", {
        ...options,
        youthProtection: undefined,
      }),
    );
    expect(run(shifts).issues.some((finding) => finding.rule.startsWith("ARBZG"))).toBe(false);
  });
  it.each([
    ["16:00", 0, null],
    ["16:30", 1, "info"],
    ["16:31", 1, "warning"],
  ])("checks daily limits at %s", (end, count, severity) => {
    const values = findings([shift("2026-10-01", "07:00", end as string)], "JARBSCHG_8_DAILY");
    expect(values).toHaveLength(count as number);
    if (severity) expect(values[0]?.severity).toBe(severity);
  });
  it.each([
    ["11:30", 0, 0],
    ["11:31", 0, 1],
    ["13:30", 30, 0],
    ["13:31", 30, 1],
    ["14:01", 60, 0],
  ])("checks pause thresholds at %s / %s", (end, pause, count) => {
    expect(
      findings([shift("2026-10-01", "07:00", end, pause)], "JARBSCHG_11_BREAK_DURATION"),
    ).toHaveLength(count);
  });
  it("does not assume the position of an aggregate pause", () => {
    expect(findings([shift("2026-10-01")], "JARBSCHG_11_BREAK_PLACEMENT")[0]?.severity).toBe(
      "info",
    );
  });
  it("sums two services on one calendar day and treats unconfirmed gap pauses conditionally", () => {
    const result = run([
      shift("2026-10-01", "07:00", "12:00", 0, "a"),
      shift("2026-10-01", "13:00", "17:00", 0, "b"),
    ]);
    expect(result.issues.find((item) => item.rule === "JARBSCHG_8_DAILY")?.severity).toBe(
      "warning",
    );
    expect(result.issues.find((item) => item.rule === "JARBSCHG_11_BREAK_DURATION")?.severity).toBe(
      "info",
    );
  });
  it("keeps overlapping work from being counted twice", () => {
    expect(
      findings(
        [
          shift("2026-10-01", "07:00", "12:00", 0, "a"),
          shift("2026-10-01", "09:00", "14:00", 0, "b"),
        ],
        "JARBSCHG_8_DAILY",
      ),
    ).toHaveLength(0);
    expect(
      run([
        shift("2026-10-01", "07:00", "12:00", 0, "a"),
        shift("2026-10-01", "09:00", "14:00", 0, "b"),
      ]).issues.some((item) => item.rule.includes("OVERLAP")),
    ).toBe(true);
  });
  it.each([
    ["17:00", 0],
    ["17:01", 1],
  ])("checks the inclusive 10-hour span at %s", (end, count) => {
    expect(findings([shift("2026-10-01", "07:00", end)], "JARBSCHG_12_SPAN")).toHaveLength(count);
  });
  it.each([
    ["07:00", 0],
    ["06:59", 1],
  ])("checks 12 hours of rest at %s", (start, count) => {
    expect(
      findings(
        [shift("2026-10-01", "10:00", "19:00"), shift("2026-10-02", start, "15:00")],
        "JARBSCHG_13_REST",
      ),
    ).toHaveLength(count);
  });
  it("uses the previous month for cross-month rest", () => {
    const result = findings(
      [shift("2026-09-30", "12:00", "21:00"), shift("2026-10-01", "08:00", "17:00")],
      "JARBSCHG_13_REST",
    );
    expect(result[0]?.date).toBe("2026-10-01");
  });
  it.each([
    ["06:00", "20:00", null],
    ["05:30", "14:00", "info"],
    ["14:00", "23:30", "info"],
    ["05:29", "14:00", "warning"],
    ["21:00", "07:00", "warning"],
  ])("never assumes an age/workplace exception for %s–%s", (start, end, severity) => {
    const values = findings([shift("2026-10-01", start, end)], "JARBSCHG_14_NIGHT");
    expect(values).toHaveLength(severity ? 1 : 0);
    if (severity) expect(values[0]?.severity).toBe(severity);
  });
  it("counts Monday–Sunday across a month boundary", () => {
    const shifts = [
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ].map((date) => shift(date));
    expect(findings(shifts, "JARBSCHG_8_WEEK")).toHaveLength(1);
    expect(findings(shifts, "JARBSCHG_15_FIVE_DAYS")).toHaveLength(1);
    expect(findings(shifts.slice(0, 5), "JARBSCHG_8_WEEK")).toHaveLength(0);
  });
  it("counts both calendar days of an overnight service", () => {
    const shifts = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map((date) =>
      shift(date),
    );
    shifts.push(shift("2026-10-09", "21:00", "07:00", 60));
    expect(findings(shifts, "JARBSCHG_15_FIVE_DAYS")).toHaveLength(1);
  });
  it("uses elapsed time through the daylight-saving change without inventing midnight pauses", () => {
    const result = run([shift("2026-10-24", "21:00", "07:00", 60)]);
    expect(result.issues.filter((item) => item.rule === "JARBSCHG_12_SPAN")).toHaveLength(1);
    expect(result.issues.filter((item) => item.rule === "JARBSCHG_8_DAILY")).toHaveLength(0);
  });
  it.each(["2026-01-01", "2026-05-01", "2026-04-05", "2026-12-25"])(
    "protects %s even in healthcare",
    (date) => {
      expect(findings([shift(date)], "JARBSCHG_18_PROTECTED", date.slice(0, 7))).toHaveLength(1);
    },
  );
  it.each([
    ["14:00", 0],
    ["14:01", 1],
  ])("protects Christmas Eve after 14:00 (end %s)", (end, count) => {
    expect(
      findings([shift("2026-12-24", "10:00", end, 0)], "JARBSCHG_18_PROTECTED", "2026-12"),
    ).toHaveLength(count);
  });
  it("does not approve healthcare weekend and holiday exceptions", () => {
    expect(findings([shift("2026-10-03")], "JARBSCHG_18_HOLIDAY")[0]?.severity).toBe("info");
    expect(findings([shift("2026-10-04")], "JARBSCHG_16_17_WEEKEND")[0]?.description).toContain(
      "derselben Woche",
    );
  });
  it("requires two free Sundays even with the healthcare exception", () => {
    const shifts = ["2026-10-04", "2026-10-11", "2026-10-18"].map((date) => shift(date));
    expect(findings(shifts, "JARBSCHG_17_FREE_SUNDAYS")).toHaveLength(1);
    expect(findings(shifts.slice(0, 2), "JARBSCHG_17_FREE_SUNDAYS")).toHaveLength(0);
  });
  it("does not infer statutory school credits from a training service", () => {
    const training = { ...shift("2026-10-01"), type: "TRAINING" as const };
    expect(findings([training], "JARBSCHG_SCHOOL_SCOPE")).toHaveLength(1);
  });
  it("ignores deleted services and preserves optional planning findings", () => {
    expect(
      run([{ ...shift("2026-10-01", "21:00", "07:00"), deletedAt: "2026-10-05T00:00:00Z" }]).issues,
    ).toHaveLength(0);
    const shifts = [
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ].map((date) => shift(date));
    expect(run(shifts).issues.some((item) => item.kind === "PLANNING")).toBe(true);
  });
});

it("subtracts overnight pauses only once from weekly hours", () => {
  const shifts = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map(
    (date) => shift(date, "21:00", "06:00", 30),
  );
  expect(findings(shifts, "JARBSCHG_8_WEEK")).toHaveLength(1);
});
