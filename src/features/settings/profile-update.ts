import type { TariffProfile } from "@/domain/types";
import type { SalaryMode } from "@/features/settings/settings-form-values";

export type ProfileEditorSection = "WORK" | "TARIFF";

export interface ProfileSalaryUpdate {
  readonly tariff: TariffProfile | null;
  readonly manualMonthlyGrossCents: number | null;
}

export function resolveSalaryUpdate(
  section: ProfileEditorSection,
  currentTariff: TariffProfile | null,
  currentManualMonthlyGrossCents: number | null,
  salaryMode: SalaryMode,
  tariffDraft: TariffProfile,
  manualMonthlyGrossCents: number | null,
): ProfileSalaryUpdate {
  if (section === "WORK") {
    return { tariff: currentTariff, manualMonthlyGrossCents: currentManualMonthlyGrossCents };
  }
  if (salaryMode === "UNSET") {
    return { tariff: currentTariff, manualMonthlyGrossCents: currentManualMonthlyGrossCents };
  }
  if (
    salaryMode === "TVAOED_PFLEGE" ||
    salaryMode === "TVOED_E" ||
    salaryMode === "TVL_KR" ||
    salaryMode === "TVUK_NURSING" ||
    salaryMode === "TVH_KR"
  )
    return { tariff: null, manualMonthlyGrossCents: null };
  return salaryMode === "MANUAL"
    ? { tariff: null, manualMonthlyGrossCents }
    : { tariff: tariffDraft, manualMonthlyGrossCents: null };
}
