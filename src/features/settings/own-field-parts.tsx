import { DropdownField, Field } from "@/ui/form-controls";
import type { OwnRateDraft } from "./own-remuneration-form";

export const partialMonthOptions = [
  { value: "unconfirmed" as const, label: "Noch nicht bestätigt" },
  { value: "calendar-days" as const, label: "Anteil nach Kalendertagen" },
];
export function OwnRateFields({
  value,
  onChange,
  label,
}: {
  value: OwnRateDraft;
  onChange: (value: OwnRateDraft) => void;
  label: string;
}) {
  return (
    <>
      <DropdownField
        label={label + " · Berechnungsart"}
        value={value.kind}
        options={[
          { value: "percent", label: "Prozent" },
          { value: "hourly", label: "Euro pro Stunde" },
        ]}
        onChange={(kind) => kind !== value.kind && onChange({ kind, amount: "" })}
      />
      <Field
        label={label + (value.kind === "percent" ? " in Prozent" : " in Euro/Stunde")}
        value={value.amount}
        keyboardType="decimal-pad"
        returnKeyType="done"
        onChangeText={(amount) => onChange({ ...value, amount })}
      />
    </>
  );
}
export function OwnValidityFields({
  value,
  onChange,
  label,
}: {
  value: { validFrom: string; validTo: string };
  onChange: (change: { validFrom?: string; validTo?: string }) => void;
  label: string;
}) {
  return (
    <>
      <Field
        label={label + " · Gültig ab"}
        value={value.validFrom}
        placeholder="TT.MM.JJJJ"
        autoCapitalize="none"
        onChangeText={(validFrom) => onChange({ validFrom })}
      />
      <Field
        label={label + " · Gültig bis (optional)"}
        value={value.validTo}
        placeholder="Unbefristet"
        autoCapitalize="none"
        onChangeText={(validTo) => onChange({ validTo })}
      />
    </>
  );
}
