import type { TariffProfile } from "@/domain/types";

export type ProfileEditorSection = "WORK" | "TARIFF";

export function resolveTariffUpdate(
  section: ProfileEditorSection,
  currentTariff: TariffProfile | null,
  tariffDraft: TariffProfile,
): TariffProfile | null {
  return section === "WORK" ? currentTariff : tariffDraft;
}
