import { Temporal } from "@js-temporal/polyfill";
import { afterEach, describe, expect, it, vi } from "vitest";
import carrierValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r4.json";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import { calculateMonthlyPayEstimate } from "./simple-pay";
import { getTvhKrTable } from "./simple-tvh-kr-pay";

const carrier = carrierValue as RuleTariffPackage;
function resolver(pkg = carrier) {
  return createRuleResolver({
    tariff: [pkg],
    legal: BUNDLED_LEGAL_RULES,
    holiday: BUNDLED_HOLIDAY_RULES,
  });
}
const profile: UserProfile = {
  federalState: "HE",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  tvhKrTariff: { payGroup: "KR8", payLevel: 4, fullTimeWeeklyMinutes: 2310 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
function nights(): ShiftEntry[] {
  return Array.from({ length: 20 }, (_, i) => ({
    kind: "SHIFT",
    id: "performance-" + i,
    date: "2026-10-" + String(i + 1).padStart(2, "0"),
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "21:00",
    endTime: "07:00",
    breakMinutes: 60,
    color: "#000000",
    symbol: "N",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    deletedAt: null,
  }));
}
afterEach(() => vi.restoreAllMocks());
describe("TV-H performance with verified tables", () => {
  it("resolves zoned getters per section rather than for every worked minute", () => {
    const hour = vi.spyOn(Temporal.ZonedDateTime.prototype, "hour", "get");
    const minute = vi.spyOn(Temporal.ZonedDateTime.prototype, "minute", "get");
    const weekday = vi.spyOn(Temporal.ZonedDateTime.prototype, "dayOfWeek", "get");
    const pay = calculateMonthlyPayEstimate(
      "2026-10",
      nights(),
      profile,
      null,
      undefined,
      undefined,
      resolver(),
    );
    expect(pay.available).toBe(true);
    expect(pay.shiftBreakdowns).toHaveLength(20);
    expect(
      hour.mock.calls.length + minute.mock.calls.length + weekday.mock.calls.length,
    ).toBeLessThan(400);
  });
  it("reuses immutable remote tables and replaces them when catalog amounts change", () => {
    const original = resolver();
    const first = getTvhKrTable("2026-10-01", original)!;
    expect(getTvhKrTable("2026-10-20", original)).toBe(first);
    expect(Object.isFrozen(first.monthlyCents.KR8)).toBe(true);
    const changed = structuredClone(carrier);
    for (const table of changed.rules.simpleTariffTables!.tables)
      if (table.tariffId === "TVH_KR") for (const row of table.entries) row.monthlyCents += 10000;
    const next = getTvhKrTable("2026-10-01", resolver(changed))!;
    expect(next).not.toBe(first);
    expect(next.monthlyCents.KR8[0]).toBe(first.monthlyCents.KR8[0] + 10000);
    expect(getTvhKrTable("2027-10-01", original)).not.toBe(first);
  });
});
