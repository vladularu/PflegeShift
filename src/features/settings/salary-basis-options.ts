import type { SalaryMode } from "@/features/settings/settings-form-values";
import type { DropdownOption } from "@/ui/form-controls";

export const SALARY_BASIS_OPTIONS = [
  { value: "UNSET", label: "Bitte wählen" },
  { value: "TVOED_P", label: "TVöD-P", group: "Pflegepersonal" },
  { value: "TVOED_E", label: "TVöD VKA · E-Tabelle", group: "Pflegepersonal" },
  { value: "TVL_KR", label: "TV-L Pflege", group: "Pflegepersonal" },
  {
    value: "TVH_KR",
    label: "TV-H Pflege",
    subtitle: "Hessen",
    selectionLabel: "TV-H Pflege · Hessen",
    group: "Pflegepersonal",
  },
  {
    value: "TVUK_NURSING",
    label: "TV-UK Pflege",
    subtitle: "Baden-Württemberg",
    selectionLabel: "TV-UK Pflege · Baden-Württemberg",
    group: "Pflegepersonal",
  },
  {
    value: "TVAOED_PFLEGE",
    label: "TVAöD Pflege",
    selectionLabel: "TVAöD Pflege · Ausbildung",
    group: "Ausbildung",
  },
  {
    value: "TVAL_PFLEGE",
    label: "TVA-L Pflege",
    selectionLabel: "TVA-L Pflege · Ausbildung",
    group: "Ausbildung",
  },
  { value: "MANUAL", label: "Monatsbrutto selbst eintragen", group: "Eigenes Gehalt" },
] as const satisfies readonly DropdownOption<SalaryMode>[];
