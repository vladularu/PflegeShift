import currentValue from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type {
  DatedRemunerationProfile,
  TvlEmploymentCategory,
} from "@/domain/remuneration-profile";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import type { ShiftEntry } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

export const tvlRules = resolver([currentValue as RuleTariffPackage]);
export const tvlSaturday = shift({ date: "2026-09-19", startTime: "13:00", endTime: "14:00" });
export function tvlProfile(
  category: TvlEmploymentCategory | null = "SALARIED_SECTION_38_5_1",
): DatedRemunerationProfile {
  return {
    ...history("2026-04-01"),
    data: {
      version: 4,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff",
        packageId: "tvl-kr-tdl",
        variant: "SECTION_43",
        region: "WEST_38_5",
        group: "KR5",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        tvlEmploymentCategory: category,
      },
    },
  };
}
export function tvlFact(
  shiftWork: boolean | null,
  entry: ShiftEntry = tvlSaturday,
  profile = tvlProfile(),
): SavedTvlShiftWork {
  return {
    shiftId: entry.id,
    shiftRevision: entry.revision,
    shiftDate: entry.date,
    shiftUpdatedAt: entry.updatedAt,
    timeZone: work.timeZone,
    profileEffectiveFrom: profile.effectiveFrom!,
    profileRevision: profile.revision,
    shiftWork,
    revision: 1,
    confirmedAt: entry.updatedAt,
    updatedAt: entry.updatedAt,
  };
}
