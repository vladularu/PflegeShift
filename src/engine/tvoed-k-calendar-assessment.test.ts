import { describe, expect, it } from "vitest";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import { calculateMonthlyPayEstimate, calculateMonthlyTvoedAssessment } from "./pay";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import {
  buildAnnualReportSteps,
  createAnnualReportComputationCache,
} from "@/features/analysis/annual-report";

const profile: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: {
    payGroup: "P8",
    payLevel: 4,
    sector: "BT_K",
    tariffRegion: "OTHER",
    fullTimeWeeklyMinutes: 2310,
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const settings = {
  workplaceCoverage: "AROUND_THE_CLOCK" as const,
  assignment: "PERMANENT" as const,
  updatedAt: null,
};
function shift(date: string, type: ShiftEntry["type"] = "NIGHT"): ShiftEntry {
  const absence = type === "SICK" || type === "VACATION";
  return {
    id: date,
    kind: "SHIFT",
    date,
    type,
    title: type,
    templateId: null,
    startTime: absence ? null : type === "EARLY" ? "07:00" : type === "LATE" ? "13:00" : "21:00",
    endTime: absence ? null : type === "EARLY" ? "15:00" : type === "LATE" ? "21:00" : "07:00",
    breakMinutes: absence ? 0 : 30,
    allDay: absence,
    color: "#000000",
    symbol: "N",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    deletedAt: null,
  };
}
const july = [
  shift("2026-07-02"),
  shift("2026-07-04", "EARLY"),
  shift("2026-07-06", "LATE"),
  shift("2026-07-23"),
  shift("2026-07-24"),
];
const assess = (entries = july, month = "2026-07", selectedProfile = profile) =>
  calculateMonthlyTvoedAssessment(
    month,
    entries.filter((s) => s.date.startsWith(month)),
    entries,
    settings,
    bundledRuleResolver,
    selectedProfile,
  );
const pay = (entries = july, month = "2026-07") =>
  calculateMonthlyPayEstimate(month, entries, profile, null, entries, settings);

describe("shared BT-K monthly estimate", () => {
  it("keeps monthly and cached annual amounts aligned after a calendar change", () => {
    const cache = createAnnualReportComputationCache();
    const report = (entries: ShiftEntry[]) => {
      const steps = buildAnnualReportSteps(
        2026,
        entries,
        profile,
        [],
        settings,
        cache,
        "2026-09-01",
      );
      let next = steps.next();
      while (!next.done) next = steps.next();
      return next.value;
    };
    const entries = [...july, shift("2026-08-03", "SICK")];
    for (const month of ["2026-07", "2026-08"]) {
      expect(report(entries).months.find((m) => m.month === month)?.estimatedGrossAmount).toBe(
        pay(entries, month).estimatedGrossAmount,
      );
    }
    const edited = entries.map((s) =>
      s.date === "2026-07-24" ? { ...s, startTime: "08:00", endTime: "16:00" } : s,
    );
    expect(report(edited).months.find((m) => m.month === "2026-07")?.estimatedGrossAmount).toBe(
      pay(edited).estimatedGrossAmount,
    );
    expect(report(edited).months.find((m) => m.month === "2026-07")?.estimatedGrossAmount).not.toBe(
      report(entries).months.find((m) => m.month === "2026-07")?.estimatedGrossAmount,
    );
  });
  it("does not invent an absence allowance without a prior pattern", () => {
    expect(pay([shift("2026-08-03", "VACATION")], "2026-08").allowanceAmount).toBe(0);
  });
  it("does not continue a temporary hourly allowance during absence", () => {
    const entries = [...july, shift("2026-08-03", "SICK")];
    expect(
      calculateMonthlyPayEstimate("2026-08", entries, profile, null, entries, {
        ...settings,
        assignment: "TEMPORARY",
      }).allowanceAmount,
    ).toBe(0);
  });
  it("preserves a manually selected allowance even when the calendar is empty", () => {
    const decision = {
      month: "2026-08",
      allowanceStatus: "SHIFT_MONTHLY" as const,
      confirmedAt: profile.updatedAt,
      note: null,
      revision: 1,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
    const result = calculateMonthlyPayEstimate("2026-08", [], profile, decision, [], settings);
    expect(result.confirmedAllowance).toBe("SHIFT_MONTHLY");
    expect(result.allowanceAmount).toBeGreaterThan(0);
  });
  it("shares the same monthly night evidence with pay", () => {
    expect(assess().nightSequence?.dates).toEqual(["2026-07-02", "2026-07-23", "2026-07-24"]);
    expect(pay().assessment).toEqual(assess().assessment);
    expect(pay().assessment.suggestedAllowance).toBe("ALTERNATING_MONTHLY");
  });
  it("does not reuse an old pair as current-month evidence", () => {
    const entries = [...july, shift("2026-08-03", "EARLY")];
    expect(assess(entries, "2026-08").nightSequence?.dates).toEqual([]);
    expect(assess(entries, "2026-08").assessment?.estimateNote).toMatch(/Vorläufig/);
    expect(
      assess(entries, "2026-08").assessment?.criteria.find((c) => c.key === "NIGHT_SHIFTS")?.state,
    ).toBe("OPEN");
  });
  it("allows a previous-year anchor but reserves both follow-ups for January", () => {
    const entries = [shift("2026-12-20"), shift("2027-01-02"), shift("2027-01-03")];
    expect(assess(entries, "2027-01").nightSequence?.dates).toHaveLength(3);
    expect(assess(entries, "2026-12").nightSequence?.dates).toEqual([]);
  });
  it.each(["VACATION", "SICK"] as const)(
    "keeps a permanent monthly absence estimate provisional: %s",
    (type) => {
      const entries = [...july, shift("2026-08-03", type)];
      expect(pay(entries, "2026-08").allowanceAmount).toBe(pay().allowanceAmount);
      expect(pay(entries, "2026-08").assessment.estimateNote).toMatch(/Urlaub|Krankheit/);
      expect(pay(entries, "2026-08").assessment.alternatingShiftWork).toBe("REVIEW");
    },
  );
  it("does not carry an allowance into an empty month", () => {
    expect(pay(july, "2026-08").allowanceAmount).toBe(0);
    expect(pay(july, "2026-08").assessment.estimateNote).toMatch(/Vorläufig/);
  });
  it("keeps manual NONE above the automatic result", () => {
    const decision = {
      month: "2026-07",
      allowanceStatus: "NONE" as const,
      confirmedAt: profile.updatedAt,
      note: null,
      revision: 1,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
    const result = calculateMonthlyPayEstimate("2026-07", july, profile, decision, july, settings);
    expect(result.allowanceAmount).toBe(0);
    expect(result.confirmedAllowance).toBe("NONE");
  });
  it("keeps other tariff sectors on their existing path", () => {
    expect(
      assess(july, "2026-07", { ...profile, tariff: { ...profile.tariff!, sector: "BT_B" } })
        .nightSequence,
    ).toBeUndefined();
  });
  it("updates evidence after an edit or deletion without retaining the prior result", () => {
    expect(assess().nightSequence?.dates).toHaveLength(3);
    expect(
      assess(
        july.map((s) => (s.date === "2026-07-24" ? { ...s, deletedAt: profile.updatedAt } : s)),
      ).nightSequence?.dates,
    ).toEqual([]);
    expect(
      assess(
        july.map((s) =>
          s.date === "2026-07-24" ? { ...s, startTime: "08:00", endTime: "16:00" } : s,
        ),
      ).nightSequence?.dates,
    ).toEqual([]);
  });
});
