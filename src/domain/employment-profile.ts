import type { FederalState, HolidayRegion, TariffRegion, TariffSector } from "@/domain/types";

const REGIONAL_HOLIDAYS_BY_STATE: Readonly<
  Partial<Record<FederalState, readonly HolidayRegion[]>>
> = Object.freeze({
  BY: Object.freeze<HolidayRegion[]>(["UNKNOWN", "NONE", "BY_MARIA_HIMMELFAHRT", "BY_AUGSBURG"]),
  SN: Object.freeze<HolidayRegion[]>(["UNKNOWN", "NONE", "SN_FRONLEICHNAM"]),
  TH: Object.freeze<HolidayRegion[]>(["UNKNOWN", "NONE", "TH_FRONLEICHNAM"]),
});

export function holidayRegionsForState(state: FederalState): readonly HolidayRegion[] {
  return REGIONAL_HOLIDAYS_BY_STATE[state] ?? Object.freeze(["NONE"]);
}

export function defaultHolidayRegion(state: FederalState): HolidayRegion {
  return REGIONAL_HOLIDAYS_BY_STATE[state] ? "UNKNOWN" : "NONE";
}

export function isHolidayRegionCompatible(state: FederalState, region: HolidayRegion): boolean {
  return holidayRegionsForState(state).includes(region);
}

export function defaultTariffRegion(state: FederalState): TariffRegion {
  return state === "BW" ? "KAV_BW" : "OTHER";
}

export function tariffFullTimeWeeklyMinutes(
  sector: TariffSector,
  tariffRegion: TariffRegion,
): number {
  return sector === "BT_K" && tariffRegion === "OTHER" ? 38.5 * 60 : 39 * 60;
}
