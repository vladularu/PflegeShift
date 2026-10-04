import { DropdownField, Field } from "@/ui/form-controls";
import type { TariffAnnualDraft } from "./tariff-annual-model";

export interface TariffAnnualFieldProps {
  readonly value: TariffAnnualDraft;
  readonly onChange: (draft: TariffAnnualDraft) => void;
  readonly disabled: boolean;
}
export function AnnualAnswer({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: boolean | null;
  readonly onChange: (value: boolean | null) => void;
}) {
  return (
    <DropdownField
      label={label}
      value={value === null ? "unknown" : value ? "yes" : "no"}
      options={[
        { value: "unknown", label: "Noch unbekannt" },
        { value: "yes", label: "Ja" },
        { value: "no", label: "Nein" },
      ]}
      onChange={(answer) => onChange(answer === "unknown" ? null : answer === "yes")}
    />
  );
}
export function AnnualConfirmation({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <DropdownField
      label={label}
      value={value ? "yes" : "no"}
      options={[
        { value: "no", label: "Noch nicht bestätigt" },
        { value: "yes", label: "Bestätigt" },
      ]}
      onChange={(answer) => onChange(answer === "yes")}
    />
  );
}
export function AnnualText({
  label,
  value,
  onChange,
  disabled,
  kind = "number",
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly disabled: boolean;
  readonly kind?: "number" | "date" | "money";
  readonly placeholder?: string;
}) {
  return (
    <Field
      label={label}
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      keyboardType={
        kind === "money"
          ? "decimal-pad"
          : kind === "date"
            ? "numbers-and-punctuation"
            : "number-pad"
      }
      placeholder={placeholder ?? "Unbekannt"}
      returnKeyType="done"
      maxLength={16}
    />
  );
}
