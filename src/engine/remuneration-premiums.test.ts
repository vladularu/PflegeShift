import { describe, expect, it } from "vitest";
import candidateValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { bundledRuleResolver, createRuleResolver } from "@/rules/rule-resolver";
import { calculateShiftPremiumBreakdown, calculateShiftTimePremiumInterval } from "./pay";
import {
  calculateDatedShiftTimePremiums,
  calculateMonthlyTimeRemuneration,
} from "./remuneration-premiums";
import { bindRemunerationTariffResolver } from "./remuneration-tariff-adapter";

const candidate = candidateValue as RuleTariffPackage;
const resolver = (packages = [candidate], holidays = BUNDLED_HOLIDAY_RULES) =>
  createRuleResolver({ tariff: packages, legal: BUNDLED_LEGAL_RULES, holiday: holidays });
const work: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  timeZone: "Europe/Berlin",
  weeklyMinutes: 2310,
  regularRotatingNightWork: true,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: {
    payGroup: "P5",
    payLevel: 1,
    sector: "BT_K",
    tariffRegion: "OTHER",
    fullTimeWeeklyMinutes: 2310,
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
function history(date = "2026-01-01", group = "P5"): DatedRemunerationProfile {
  return {
    effectiveFrom: date,
    revision: 1,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    data: {
      version: 1,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff",
        packageId: candidate.packageId,
        group,
        level: "1",
        variant: "BT_K",
        region: "OTHER",
        fullTimeWeeklyMinutes: 2310,
      },
    },
  };
}
function shift(change: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "shift",
    date: "2026-09-15",
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "23:00",
    endTime: "01:00",
    breakMinutes: 0,
    color: "#EA5B55",
    symbol: "N",
    note: null,
    overtimeMinutes: 0,
    tariffOvertimeConfirmed: false,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    deletedAt: null,
    ...change,
  };
}

describe("dated time-premium calculation", () => {
  it("does not add a rounding error merely because a shift crosses midnight", () => {
    const result = calculateDatedShiftTimePremiums(shift(), work, [history()], resolver());
    expect(result.totalCents).toBe(769); // 2 h × 19.22 EUR × 20%, rounded once.
    expect(result.netMinutes).toBe(120);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      from: "2026-09-15",
      through: "2026-09-16",
      basis: {
        minutes: 120,
        hourlyRateCents: 1922,
        percentageBasisPoints: 2000,
        ruleId: expect.any(String),
      },
    });
  });
  it("changes the premium basis at the confirmed profile's midnight boundary", () => {
    const result = calculateDatedShiftTimePremiums(
      shift(),
      work,
      [history(), history("2026-09-16", "P6")],
      resolver(),
    );
    expect(
      result.positions.map((line) => [line.from, line.amountCents, line.basis.hourlyRateCents]),
    ).toEqual([
      ["2026-09-15", 384, 1922],
      ["2026-09-16", 402, 2009],
    ]);
    expect(result.totalCents).toBe(786);
  });
  it("applies the actual new package after a midnight table change", () => {
    const after = structuredClone(candidate);
    after.versionId = "synthetic-next";
    after.validFrom = "2026-09-16";
    after.rules.premiumRules = after.rules.premiumRules.map((rule) =>
      rule.premiumType === "NIGHT" ? { ...rule, percentageBasisPoints: 3000 } : rule,
    );
    const result = calculateDatedShiftTimePremiums(
      shift(),
      work,
      [history()],
      resolver([{ ...candidate, validTo: "2026-09-15" }, after]),
    );
    expect(result.totalCents).toBe(961); // 3.84 + 5.77
    expect(result.positions.map((line) => line.source.versionId)).toEqual([
      candidate.versionId,
      "synthetic-next",
    ]);
  });
  it("deducts the original whole-shift pause only once across the split", () => {
    const result = calculateDatedShiftTimePremiums(
      shift({ breakMinutes: 60 }),
      work,
      [history(), history("2026-09-16", "P6")],
      resolver(),
    );
    expect(result.netMinutes).toBe(60);
    expect(result.positions.map((line) => line.basis.minutes)).toEqual([30, 30]);
    expect(result.positions.map((line) => line.amountCents)).toEqual([192, 201]);
    expect(result.status).toBe("estimated");
    expect(
      result.positions.every((line) => line.basis.pauseMethod === "centered-duration-estimate"),
    ).toBe(true);
  });
  it.each([
    ["2026-03-28", 420, 360, 300],
    ["2026-10-24", 540, 480, 420],
  ])("counts actual elapsed minutes through clock changes on %s", (date, net, night, sunday) => {
    const result = calculateDatedShiftTimePremiums(
      shift({ date: String(date), startTime: "22:00", endTime: "07:00", breakMinutes: 60 }),
      work,
      [history()],
      bundledRuleResolver,
    );
    expect(result.netMinutes).toBe(net);
    expect(
      result.positions
        .filter((line) => line.label.toLowerCase().includes("nacht"))
        .reduce((sum, line) => sum + line.basis.minutes, 0),
    ).toBe(night);
    expect(
      result.positions
        .filter((line) => line.label.toLowerCase().includes("sonntag"))
        .reduce((sum, line) => sum + line.basis.minutes, 0),
    ).toBe(sunday);
  });
  it("assigns previous-month carryover by worked day, without duplicate minutes", () => {
    const entry = shift({ date: "2026-09-30" });
    const september = calculateMonthlyTimeRemuneration(
      "2026-09",
      [entry],
      work,
      [history()],
      resolver(),
    );
    const october = calculateMonthlyTimeRemuneration(
      "2026-10",
      [entry],
      work,
      [history()],
      resolver(),
    );
    expect([september.netMinutes, october.netMinutes]).toEqual([60, 60]);
    expect([september.totalCents, october.totalCents]).toEqual([384, 384]);
    expect(october.positions[0].from).toBe("2026-10-01");
  });
  it("never fills an unknown beginning with the latest current salary", () => {
    const result = calculateDatedShiftTimePremiums(
      shift(),
      work,
      [history("2026-09-16", "P6")],
      resolver(),
    );
    expect(result.totalCents).toBeNull();
    expect(result.knownSubtotalCents).toBe(402);
    expect(result.positions[0].issue?.code).toBe("PROFILE_MISSING");
  });
  it("reports a missing reference-stage hourly rate rather than zero", () => {
    const missing = structuredClone(candidate);
    missing.rules.payTables[0].entries = missing.rules.payTables[0].entries.filter(
      (entry) => !(entry.groupId === "p5" && entry.stepId === "s3"),
    ) as (typeof missing.rules.payTables)[0]["entries"];
    const result = calculateDatedShiftTimePremiums(shift(), work, [history()], resolver([missing]));
    expect(result.totalCents).toBeNull();
    expect(result.positions.every((line) => line.issue?.code === "PREMIUM_RATE_MISSING")).toBe(
      true,
    );
  });
  it("does not silently replace a missing holiday catalog", () => {
    const result = calculateDatedShiftTimePremiums(
      shift(),
      work,
      [history()],
      resolver([candidate], []),
    );
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("HOLIDAY_RULES_UNAVAILABLE");
  });
  it("reports own premiums as unconfigured until their parameters are confirmed", () => {
    const own = {
      ...history(),
      data: {
        version: 1 as const,
        weeklyMinutes: 1200,
        selection: { kind: "own-monthly" as const, monthlyGrossCents: 180000 },
      },
    };
    const result = calculateDatedShiftTimePremiums(shift(), work, [own], resolver());
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("OWN_PREMIUMS_UNCONFIGURED");
  });
  it("keeps an actual zero distinct from unavailable rules", () => {
    const result = calculateDatedShiftTimePremiums(
      shift({ startTime: "08:00", endTime: "16:00", type: "DAY" }),
      work,
      [history()],
      resolver(),
    );
    expect(result.totalCents).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.positions[0].issue).toBeNull();
  });
  it("does not infer zero when the tariff has no time premium rules at all", () => {
    const broken = { ...candidate, rules: { ...candidate.rules, premiumRules: [] } };
    expect(
      calculateDatedShiftTimePremiums(shift(), work, [history()], resolver([broken])).positions[0]
        .issue?.code,
    ).toBe("PREMIUM_RATE_MISSING");
  });
  it("does not add overtime to a time-premium result", () => {
    const one = calculateDatedShiftTimePremiums(shift(), work, [history()], resolver());
    const overtime = calculateDatedShiftTimePremiums(
      shift({ overtimeMinutes: 60, tariffOvertimeConfirmed: true }),
      work,
      [history()],
      resolver(),
    );
    expect(overtime).toEqual(one);
  });
  it("ignores deleted and all-day non-work entries", () => {
    for (const entry of [
      shift({ deletedAt: work.updatedAt }),
      shift({ allDay: true, startTime: null, endTime: null, type: "VACATION" }),
    ]) {
      expect(calculateDatedShiftTimePremiums(entry, work, [], resolver())).toMatchObject({
        complete: true,
        totalCents: 0,
        netMinutes: 0,
        positions: [],
      });
    }
  });
  it("rejects duplicate shifts before doubling their premiums", () => {
    const entry = shift();
    expect(() =>
      calculateMonthlyTimeRemuneration("2026-09", [entry, entry], work, [history()], resolver()),
    ).toThrow("mehrfach");
  });
  it("preserves old full-shift results while exposing exact interval rule identities", () => {
    const entry = shift({ startTime: "21:00", endTime: "07:00", breakMinutes: 60 });
    const rules = bindRemunerationTariffResolver(resolver(), candidate.packageId);
    const legacy = calculateShiftPremiumBreakdown(entry, work, rules);
    const interval = calculateShiftTimePremiumInterval(entry, work, rules, {
      from: 0,
      until: 600,
      date: entry.date,
    });
    expect(interval.netMinutes).toBe(legacy.netMinutes);
    expect(interval.premiumLines.map(({ ruleId, ...line }) => line)).toEqual(legacy.premiumLines);
    expect(interval.premiumLines.every((line) => line.ruleId != null)).toBe(true);
    expect(calculateDatedShiftTimePremiums(entry, work, [history()], resolver()).totalCents).toBe(
      Math.round(legacy.premiumLines.reduce((sum, line) => sum + line.amount, 0) * 100),
    );
  });
  it("keeps holiday-versus-Sunday combination rules and stacks night separately", () => {
    const result = calculateDatedShiftTimePremiums(
      shift({ date: "2026-11-01", startTime: "01:00", endTime: "03:00" }),
      work,
      [history()],
      resolver(),
    );
    expect(result.positions).toHaveLength(2); // All Saints' Day on Sunday in NW.
    expect(
      result.positions.map((line) => line.basis.percentageBasisPoints).sort((a, b) => a! - b!),
    ).toEqual([2000, 3500]);
  });
  it("does not reuse a stale amount after a historical profile correction", () => {
    const rules = resolver();
    const entry = shift();
    const before = calculateDatedShiftTimePremiums(entry, work, [history()], rules);
    const after = calculateDatedShiftTimePremiums(
      entry,
      work,
      [{ ...history("2026-01-01", "P6"), revision: 2 }],
      rules,
    );
    expect([before.totalCents, after.totalCents]).toEqual([769, 804]);
  });
  it.each([
    { from: -1, until: 10 },
    { from: 20, until: 10 },
    { from: 0, until: 121 },
    { from: 0.5, until: 10 },
  ])("rejects an invalid elapsed-minute interval %j", (interval) => {
    expect(() =>
      calculateShiftTimePremiumInterval(
        shift(),
        work,
        bindRemunerationTariffResolver(resolver(), candidate.packageId),
        { ...interval, date: "2026-09-15" },
      ),
    ).toThrow("Ungültiges Zuschlagsintervall.");
  });
});
