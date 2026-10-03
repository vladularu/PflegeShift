import candidateValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r2.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";

export const candidate = candidateValue as RuleTariffPackage;
export const resolver = (packages = [candidate]) =>
  createRuleResolver({
    tariff: packages,
    legal: BUNDLED_LEGAL_RULES,
    holiday: BUNDLED_HOLIDAY_RULES,
  });
export const work: UserProfile = {
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
export function history(
  date = "2026-01-01",
  group = "P5",
  weeklyMinutes = 2310,
  level = "1",
): DatedRemunerationProfile {
  return {
    effectiveFrom: date,
    revision: 1,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: candidate.packageId,
        group,
        level,
        variant: "BT_K",
        region: "OTHER",
        fullTimeWeeklyMinutes: 2310,
      },
    },
  };
}
export function shift(change: Partial<ShiftEntry> = {}): ShiftEntry {
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
