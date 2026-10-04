import type {
  RemunerationProfileData,
  TrainingSpecialDutyAllowance,
  TvlEmploymentCategory,
  TvalEmployerScope,
} from "@/domain/remuneration-profile";
import {
  requireRemunerationDate,
  validateRemunerationProfileData,
} from "@/domain/remuneration-profile";
import { ValidationError } from "@/domain/validation";
import {
  ownConfigurationFromDraft,
  ownRemunerationDraft,
  ownDecimal,
  type OwnRemunerationDraft,
} from "./own-remuneration-form";
import type { RuleResolver } from "@/rules/rule-resolver";
import { resolveRemunerationContext } from "@/engine/remuneration-context";
import { remunerationTariffOptions } from "./remuneration-tariff-options";
import type { TvlCareAllowances } from "@/domain/tvl-care-allowances";
import type { TvalCareAllowances } from "@/domain/tval-care-allowances";

export function parseRemunerationDateInput(value: string): string {
  const text = value.trim();
  const german = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(text);
  return requireRemunerationDate(german ? `${german[3]}-${german[2]}-${german[1]}` : text);
}

export function formatRemunerationDate(date: string): string {
  requireRemunerationDate(date);
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

export interface RemunerationFormValues {
  readonly salaryMode: "UNSET" | "TARIFF" | "MANUAL";
  readonly packageId: string;
  readonly manualMonthlyGross: string;
  readonly own: OwnRemunerationDraft;
  readonly payGroup: string;
  readonly payLevel: string;
  readonly sector: string;
  readonly tariffRegion: string;
  readonly weeklyHours: string;
  readonly specialDutyAllowance?: TrainingSpecialDutyAllowance | null;
  readonly tvlEmploymentCategory?: TvlEmploymentCategory | null;
  readonly tvlCareAllowances?: TvlCareAllowances | null;
  readonly tvalEmployerScope?: TvalEmployerScope | null;
  readonly tvalCareAllowances?: TvalCareAllowances | null;
}

export function remunerationFormValues(data: RemunerationProfileData): RemunerationFormValues {
  const selection = data.selection;
  const config = selection.kind === "own-configured" ? selection.configuration : undefined;
  return {
    salaryMode:
      selection.kind === "tariff"
        ? "TARIFF"
        : selection.kind === "own-monthly" || selection.kind === "own-configured"
          ? "MANUAL"
          : "UNSET",
    packageId: selection.kind === "tariff" ? selection.packageId : "",
    manualMonthlyGross:
      selection.kind === "own-monthly"
        ? (selection.monthlyGrossCents / 100).toFixed(2).replace(".", ",")
        : config
          ? ownDecimal(
              config.base.kind === "monthly" ? config.base.personalCents : config.base.centsPerHour,
            )
          : "",
    own: ownRemunerationDraft(config),
    payGroup: selection.kind === "tariff" ? selection.group : "",
    payLevel: selection.kind === "tariff" ? selection.level : "",
    sector: selection.kind === "tariff" ? selection.variant : "",
    tariffRegion: selection.kind === "tariff" ? selection.region : "",
    weeklyHours: String(data.weeklyMinutes / 60).replace(".", ","),
    specialDutyAllowance:
      selection.kind === "tariff" ? (selection.specialDutyAllowance ?? null) : null,
    tvlEmploymentCategory:
      selection.kind === "tariff" ? (selection.tvlEmploymentCategory ?? null) : null,
    tvlCareAllowances: selection.kind === "tariff" ? (selection.tvlCareAllowances ?? null) : null,
    tvalEmployerScope: selection.kind === "tariff" ? (selection.tvalEmployerScope ?? null) : null,
    tvalCareAllowances: selection.kind === "tariff" ? (selection.tvalCareAllowances ?? null) : null,
  };
}

export function remunerationDataFromForm(
  values: RemunerationFormValues,
  date: string,
  resolver: RuleResolver,
): RemunerationProfileData {
  requireRemunerationDate(date);
  if (values.salaryMode === "UNSET")
    throw new ValidationError("Bitte eine Gehaltsgrundlage wählen.");
  if (!/^\d+(?:[,.]\d{1,2})?$/u.test(values.weeklyHours.trim()))
    throw new ValidationError("Bitte gültige Wochenstunden angeben.");
  const weeklyMinutes = Math.round(Number(values.weeklyHours.replace(",", ".")) * 60);
  if (values.salaryMode === "MANUAL")
    return validateRemunerationProfileData({
      version: 2,
      weeklyMinutes,
      selection: {
        kind: "own-configured",
        configuration: ownConfigurationFromDraft(values.own, values.manualMonthlyGross),
      },
    });
  const option = remunerationTariffOptions(date, resolver).available.find(
    (item) => item.id === values.packageId,
  );
  const region = option?.variants
    .find((item) => item.id === values.sector)
    ?.regions.find((item) => item.id === values.tariffRegion);
  if (
    !region ||
    !option?.groups.find((item) => item.id === values.payGroup)?.levels.includes(values.payLevel)
  )
    throw new ValidationError(
      "Bitte einen verfügbaren Tarif mit gültigem Bereich, Tarifgebiet, Gruppe und Stufe wählen.",
    );
  const data = validateRemunerationProfileData({
    version:
      values.packageId === "tvaoed-pflege-vka"
        ? 3
        : values.packageId === "tvl-kr-tdl"
          ? values.tvlCareAllowances
            ? 5
            : 4
          : values.packageId === "tval-pflege-tdl"
            ? values.tvalCareAllowances
              ? 8
              : 7
            : 1,
    weeklyMinutes,
    selection: {
      kind: "tariff",
      packageId: values.packageId,
      variant: values.sector,
      region: values.tariffRegion,
      group: values.payGroup,
      level: values.payLevel,
      fullTimeWeeklyMinutes: region.fullTimeWeeklyMinutes,
      ...(values.packageId === "tval-pflege-tdl"
        ? { tvalEmployerScope: values.tvalEmployerScope ?? null }
        : {}),
      ...(values.packageId === "tval-pflege-tdl" && values.tvalCareAllowances
        ? { tvalCareAllowances: values.tvalCareAllowances }
        : {}),
      ...(values.packageId === "tvl-kr-tdl" || values.packageId === "tval-pflege-tdl"
        ? { tvlEmploymentCategory: values.tvlEmploymentCategory ?? null }
        : {}),
      ...(values.packageId === "tvl-kr-tdl" && values.tvlCareAllowances
        ? { tvlCareAllowances: values.tvlCareAllowances }
        : {}),
      ...(values.packageId === "tvaoed-pflege-vka"
        ? { specialDutyAllowance: values.specialDutyAllowance ?? null }
        : {}),
    },
  });
  const context = resolveRemunerationContext(
    date,
    [
      {
        data,
        effectiveFrom: date,
        revision: 1,
        createdAt: "2000-01-01T00:00:00Z",
        updatedAt: "2000-01-01T00:00:00Z",
      },
    ],
    resolver,
  );
  if (
    context.kind !== "tariff" &&
    context.kind !== "training-tariff" &&
    context.kind !== "tvl-kr" &&
    context.kind !== "tval-training"
  )
    throw new ValidationError(
      "Diese Tarifauswahl ist für den Gültigkeitsbeginn nicht berechenbar.",
    );
  return data;
}
