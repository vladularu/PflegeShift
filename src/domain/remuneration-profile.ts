import type { UserProfile } from "@/domain/types";
import { UserFacingError } from "@/domain/errors";
import { validateOwnRemuneration, type OwnRemunerationConfiguration } from "./own-remuneration";
import { validateTvlCareAllowances, type TvlCareAllowances } from "./tvl-care-allowances";
import { validateTvalCareAllowances, type TvalCareAllowances } from "./tval-care-allowances";

export type TrainingSpecialDutyAllowance = "NONE" | "PE1_ONLY" | "OTHER_OR_MULTIPLE";
export type TvlEmploymentCategory = "SALARIED_SECTION_38_5_1" | "OTHER";
export type TvalEmployerScope = "GENERAL" | "SECTION_43";

export type RemunerationSelection =
  | { readonly kind: "unconfigured" }
  | { readonly kind: "own-monthly"; readonly monthlyGrossCents: number }
  | { readonly kind: "own-configured"; readonly configuration: OwnRemunerationConfiguration }
  | {
      readonly kind: "tariff";
      readonly packageId: string;
      readonly variant: string;
      readonly region: string;
      readonly group: string;
      readonly level: string;
      readonly fullTimeWeeklyMinutes: number;
      /** v3 only. Missing/null means unknown, not an absence of entitlement. */
      readonly specialDutyAllowance?: TrainingSpecialDutyAllowance | null;
      /** v4/v5 TV-L and v7 TVA-L; unknown stays null, never inferred from occupation or age. */
      readonly tvlEmploymentCategory?: TvlEmploymentCategory | null;
      /** v5; explicit dated care-duty confirmations. */
      readonly tvlCareAllowances?: TvlCareAllowances | null;
      /** v6; explicitly confirmed employer rule, independent of training category. */
      readonly tvalEmployerScope?: TvalEmployerScope | null;
      /** v8; independent dated training-activity confirmations. */
      readonly tvalCareAllowances?: TvalCareAllowances | null;
    };

/** Shared local contract; tariff amounts remain in the versioned rule catalog. */
export interface RemunerationProfileData {
  /** v1 legacy; v2 own; v3 TVAöD; v4 TV-L category; v5 care; v6 TVA-L employer; v7 category; v8 training care. */
  readonly version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly weeklyMinutes: number;
  readonly selection: RemunerationSelection;
}

export interface DatedRemunerationProfile {
  readonly effectiveFrom: string | null;
  readonly data: RemunerationProfileData;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SaveDatedRemunerationProfileInput {
  readonly effectiveFrom: string;
  readonly data: RemunerationProfileData;
  /** 0 creates a new date; a correction requires the exact current revision. */
  readonly expectedRevision: number;
}

export class RemunerationProfileError extends UserFacingError {
  constructor(message = "Das Vergütungsprofil ist ungültig oder wird noch nicht unterstützt.") {
    super(message);
    this.name = "RemunerationProfileError";
  }
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RemunerationProfileError();
  }
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(result, key))
  ) {
    throw new RemunerationProfileError();
  }
  return result;
}

function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new RemunerationProfileError();
  }
  return value as number;
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u.test(value)) {
    throw new RemunerationProfileError();
  }
  return value;
}

export function requireRemunerationDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value < "1900-01-01" ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new RemunerationProfileError("Bitte ein gültiges Gültigkeitsdatum angeben.");
  }
  return value;
}

export function validateRemunerationProfileData(value: unknown): RemunerationProfileData {
  const root = record(value, ["version", "weeklyMinutes", "selection"]);
  if (
    root.version !== 1 &&
    root.version !== 2 &&
    root.version !== 3 &&
    root.version !== 4 &&
    root.version !== 5 &&
    root.version !== 6 &&
    root.version !== 7 &&
    root.version !== 8
  )
    throw new RemunerationProfileError();
  const weeklyMinutes = integer(root.weeklyMinutes, 60, 4800);
  const raw = root.selection;
  if (typeof raw !== "object" || raw === null || !("kind" in raw)) {
    throw new RemunerationProfileError();
  }
  if (root.version === 2) {
    const own = record(raw, ["kind", "configuration"]);
    if (own.kind !== "own-configured") throw new RemunerationProfileError();
    return Object.freeze({
      version: 2,
      weeklyMinutes,
      selection: Object.freeze({
        kind: "own-configured",
        configuration: validateOwnRemuneration(own.configuration),
      }),
    });
  }
  let selection: RemunerationSelection;
  if (
    (root.version === 3 ||
      root.version === 4 ||
      root.version === 5 ||
      root.version === 6 ||
      root.version === 7 ||
      root.version === 8) &&
    raw.kind !== "tariff"
  )
    throw new RemunerationProfileError();
  if (raw.kind === "unconfigured") {
    record(raw, ["kind"]);
    selection = { kind: "unconfigured" };
  } else if (raw.kind === "own-monthly") {
    const own = record(raw, ["kind", "monthlyGrossCents"]);
    selection = {
      kind: "own-monthly",
      monthlyGrossCents: integer(own.monthlyGrossCents, 1, 10_000_000),
    };
  } else if (raw.kind === "tariff") {
    const tariff = record(raw, [
      "kind",
      "packageId",
      "variant",
      "region",
      "group",
      "level",
      "fullTimeWeeklyMinutes",
      ...(root.version === 3 ? ["specialDutyAllowance"] : []),
      ...(root.version === 4 || root.version === 5 || root.version === 7 || root.version === 8
        ? ["tvlEmploymentCategory"]
        : []),
      ...(root.version === 5 ? ["tvlCareAllowances"] : []),
      ...(root.version === 6 || root.version === 7 || root.version === 8
        ? ["tvalEmployerScope"]
        : []),
      ...(root.version === 8 ? ["tvalCareAllowances"] : []),
    ]);
    const specialDutyAllowance = tariff.specialDutyAllowance;
    const tvlEmploymentCategory = tariff.tvlEmploymentCategory;
    const tvalEmployerScope = tariff.tvalEmployerScope;
    if (
      (root.version === 6 || root.version === 7 || root.version === 8) &&
      (tariff.packageId !== "tval-pflege-tdl" ||
        (tvalEmployerScope !== null &&
          tvalEmployerScope !== "GENERAL" &&
          tvalEmployerScope !== "SECTION_43"))
    )
      throw new RemunerationProfileError();
    if (
      (root.version === 4 || root.version === 5 || root.version === 7 || root.version === 8) &&
      (tariff.packageId !==
        (root.version === 7 || root.version === 8 ? "tval-pflege-tdl" : "tvl-kr-tdl") ||
        (tvlEmploymentCategory !== null &&
          tvlEmploymentCategory !== "SALARIED_SECTION_38_5_1" &&
          tvlEmploymentCategory !== "OTHER"))
    )
      throw new RemunerationProfileError();
    if (
      root.version === 3 &&
      (tariff.packageId !== "tvaoed-pflege-vka" ||
        (specialDutyAllowance !== null &&
          specialDutyAllowance !== "NONE" &&
          specialDutyAllowance !== "PE1_ONLY" &&
          specialDutyAllowance !== "OTHER_OR_MULTIPLE"))
    )
      throw new RemunerationProfileError();
    selection = {
      kind: "tariff",
      packageId: identifier(tariff.packageId),
      variant: identifier(tariff.variant),
      region: identifier(tariff.region),
      group: identifier(tariff.group),
      level: identifier(tariff.level),
      fullTimeWeeklyMinutes: integer(tariff.fullTimeWeeklyMinutes, 60, 4800),
      ...(root.version === 6 || root.version === 7 || root.version === 8
        ? { tvalEmployerScope: tvalEmployerScope as TvalEmployerScope | null }
        : {}),
      ...(root.version === 4 || root.version === 5 || root.version === 7 || root.version === 8
        ? { tvlEmploymentCategory: tvlEmploymentCategory as TvlEmploymentCategory | null }
        : {}),
      ...(root.version === 5
        ? { tvlCareAllowances: validateTvlCareAllowances(tariff.tvlCareAllowances) }
        : {}),
      ...(root.version === 8
        ? { tvalCareAllowances: validateTvalCareAllowances(tariff.tvalCareAllowances) }
        : {}),
      ...(root.version === 3
        ? { specialDutyAllowance: specialDutyAllowance as TrainingSpecialDutyAllowance | null }
        : {}),
    };
  } else {
    throw new RemunerationProfileError();
  }
  return Object.freeze({
    version: root.version,
    weeklyMinutes,
    selection: Object.freeze(selection),
  });
}

/** Copies known values only; never treats profile creation time as an effective date. */
export function remunerationDataFromLegacy(profile: UserProfile): RemunerationProfileData {
  const tariff = profile.tariff;
  return validateRemunerationProfileData({
    version: 1,
    weeklyMinutes: profile.weeklyMinutes,
    selection:
      tariff !== null
        ? {
            kind: "tariff",
            packageId: "tvoed-vka-bt-k",
            variant: tariff.sector,
            region: tariff.tariffRegion,
            group: tariff.payGroup,
            level: String(tariff.payLevel),
            fullTimeWeeklyMinutes: tariff.fullTimeWeeklyMinutes,
          }
        : profile.manualMonthlyGrossCents != null
          ? { kind: "own-monthly", monthlyGrossCents: profile.manualMonthlyGrossCents }
          : { kind: "unconfigured" },
  });
}

export type RemunerationProfileResolution =
  | {
      readonly status: "dated" | "unknown-effective-date";
      readonly profile: DatedRemunerationProfile;
    }
  | { readonly status: "missing"; readonly profile: null };

export function resolveRemunerationProfile(
  profiles: readonly DatedRemunerationProfile[],
  date: string,
): RemunerationProfileResolution {
  requireRemunerationDate(date);
  const dates = new Set<string | null>();
  let baseline: DatedRemunerationProfile | null = null;
  let selected: DatedRemunerationProfile | null = null;
  for (const profile of profiles) {
    if (dates.has(profile.effectiveFrom))
      throw new RemunerationProfileError("Mehrdeutige Vergütungshistorie.");
    dates.add(profile.effectiveFrom);
    if (profile.effectiveFrom === null) {
      baseline = profile;
    } else {
      requireRemunerationDate(profile.effectiveFrom);
      if (
        profile.effectiveFrom <= date &&
        (selected === null || selected.effectiveFrom! < profile.effectiveFrom)
      ) {
        selected = profile;
      }
    }
  }
  if (selected !== null) return { status: "dated", profile: selected };
  if (baseline !== null) return { status: "unknown-effective-date", profile: baseline };
  return { status: "missing", profile: null };
}
