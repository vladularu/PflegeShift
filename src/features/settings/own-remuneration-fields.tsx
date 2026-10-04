import type { Ref } from "react";
import type { TextInput } from "react-native";
import { DropdownField, Field } from "@/ui/form-controls";
import { FormSection } from "@/ui/form-layout";
import type { RemunerationFormValues } from "./remuneration-editor-values";
import { OwnPremiumAllowanceFields } from "./own-premium-allowance-fields";
import { OwnSupplementFields } from "./own-supplement-fields";
import { partialMonthOptions } from "./own-field-parts";

export function OwnRemunerationFields({
  values,
  onChange,
  amountRef,
  busy,
}: {
  values: RemunerationFormValues;
  onChange: (change: Partial<RemunerationFormValues>) => void;
  amountRef: Ref<TextInput>;
  busy: boolean;
}) {
  const own = values.own;
  const change = (patch: Partial<typeof own>) => onChange({ own: { ...own, ...patch } });
  return (
    <>
      <FormSection
        title="Eigene Vergütung"
        caption={
          own.baseKind === "monthly"
            ? "Dein persönliches Monatsbrutto. Keine erneute Teilzeitkürzung."
            : "Vergütung nach bezahlten Stunden. Urlaub und Krankheit benötigen ausdrücklich bestätigte Stunden."
        }
      >
        <DropdownField
          label="Grundvergütung"
          value={own.baseKind}
          options={[
            { value: "monthly", label: "Monatsgehalt" },
            { value: "hourly", label: "Stundenlohn" },
          ]}
          onChange={(baseKind) => {
            if (baseKind !== own.baseKind)
              onChange({ own: { ...own, baseKind }, manualMonthlyGross: "" });
          }}
        />
        <Field
          label={own.baseKind === "monthly" ? "Monatliches Brutto in Euro" : "Stundenlohn in Euro"}
          value={values.manualMonthlyGross}
          inputRef={amountRef}
          keyboardType="decimal-pad"
          returnKeyType="done"
          editable={!busy}
          onChangeText={(manualMonthlyGross) => onChange({ manualMonthlyGross })}
        />
        {own.baseKind === "monthly" ? (
          <>
            <DropdownField
              label="Anteilige Monate"
              value={own.partialMonth}
              options={partialMonthOptions}
              onChange={(partialMonth) => change({ partialMonth })}
            />
            {own.premiums.some((item) => item.rate.kind === "percent") || own.overtime !== null ? (
              <Field
                label="Bestätigter Stundenwert in Euro"
                accessibilityHint="Grundlage für prozentuale Zuschläge und zusätzliche Überstunden-Grundvergütung. Leer lassen, wenn unbekannt."
                value={own.percentageBasis}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onChangeText={(percentageBasis) => change({ percentageBasis })}
              />
            ) : null}
          </>
        ) : null}
      </FormSection>
      <OwnPremiumAllowanceFields value={own} onChange={change} />
      <OwnSupplementFields value={own} onChange={change} />
    </>
  );
}
