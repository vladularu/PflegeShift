import { DropdownField, Field, SecondaryButton } from "@/ui/form-controls";
import { FormSection } from "@/ui/form-layout";
import { OwnRateFields, OwnValidityFields, partialMonthOptions } from "./own-field-parts";
import { nextOwnId, type OwnRemunerationDraft } from "./own-remuneration-form";

export function OwnPremiumAllowanceFields({
  value,
  onChange,
}: {
  value: OwnRemunerationDraft;
  onChange: (change: Partial<OwnRemunerationDraft>) => void;
}) {
  return (
    <>
      <FormSection
        title="Zeitzuschläge"
        caption="Eigene vereinbarte Werte, keine automatisch übernommenen Tarifwerte."
      >
        {value.premiums.length > 0 ? (
          <DropdownField
            label="Zusammentreffende Zuschläge"
            value={value.combination}
            options={[
              { value: "", label: "Bitte wählen" },
              { value: "add", label: "Addieren" },
              { value: "highest", label: "Nur den höchsten berücksichtigen" },
            ]}
            onChange={(combination) => onChange({ combination })}
          />
        ) : null}
        <SecondaryButton
          disabled={value.premiums.length >= 32}
          onPress={() =>
            onChange({
              premiums: [
                ...value.premiums,
                {
                  id: nextOwnId(value.premiums, "premium"),
                  type: "night",
                  limited: true,
                  start: "",
                  end: "",
                  rate: { kind: "percent", amount: "" },
                },
              ],
            })
          }
        >
          Zeitzuschlag hinzufügen
        </SecondaryButton>
      </FormSection>
      {value.premiums.map((item, index) => {
        const label = `Zuschlag ${index + 1}`;
        const update = (patch: Partial<typeof item>) =>
          onChange({
            premiums: value.premiums.map((entry) =>
              entry.id === item.id ? { ...entry, ...patch } : entry,
            ),
          });
        return (
          <FormSection key={item.id} title={label}>
            <DropdownField
              label={label + " · Art"}
              value={item.type}
              options={[
                { value: "night", label: "Nacht" },
                { value: "saturday", label: "Samstag" },
                { value: "sunday", label: "Sonntag" },
                { value: "holiday", label: "Feiertag" },
              ]}
              onChange={(type) => update({ type, limited: type === "night" || item.limited })}
            />
            {item.type !== "night" ? (
              <DropdownField
                label={label + " · Zeitbereich"}
                value={item.limited ? "limited" : "day"}
                options={[
                  { value: "day", label: "Ganzer Tag" },
                  { value: "limited", label: "Bestimmter Zeitraum" },
                ]}
                onChange={(choice) => update({ limited: choice === "limited" })}
              />
            ) : null}
            {item.type === "night" || item.limited ? (
              <>
                <Field
                  label={label + " · Beginn"}
                  value={item.start}
                  placeholder="HH:MM"
                  onChangeText={(start) => update({ start })}
                />
                <Field
                  label={label + " · Ende"}
                  value={item.end}
                  placeholder="HH:MM"
                  onChangeText={(end) => update({ end })}
                />
              </>
            ) : null}
            <OwnRateFields label={label} value={item.rate} onChange={(rate) => update({ rate })} />
            <SecondaryButton
              onPress={() =>
                onChange({ premiums: value.premiums.filter((entry) => entry.id !== item.id) })
              }
            >
              {label + " entfernen"}
            </SecondaryButton>
          </FormSection>
        );
      })}
      <FormSection title="Feste Zulagen">
        <SecondaryButton
          disabled={value.allowances.length >= 32}
          onPress={() =>
            onChange({
              allowances: [
                ...value.allowances,
                {
                  id: nextOwnId(value.allowances, "allowance"),
                  title: "",
                  amount: "",
                  partialMonth: "unconfirmed",
                  validFrom: "",
                  validTo: "",
                },
              ],
            })
          }
        >
          Zulage hinzufügen
        </SecondaryButton>
      </FormSection>
      {value.allowances.map((item, index) => {
        const label = `Zulage ${index + 1}`;
        const update = (patch: Partial<typeof item>) =>
          onChange({
            allowances: value.allowances.map((entry) =>
              entry.id === item.id ? { ...entry, ...patch } : entry,
            ),
          });
        return (
          <FormSection
            key={item.id}
            title={label}
            caption="Persönlicher Monatsbetrag. Gültigkeit unabhängig vom Vergütungsprofil."
          >
            <Field
              label={label + " · Bezeichnung"}
              value={item.title}
              maxLength={100}
              onChangeText={(title) => update({ title })}
            />
            <Field
              label={label + " · Euro/Monat"}
              value={item.amount}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onChangeText={(amount) => update({ amount })}
            />
            <DropdownField
              label={label + " · Anteilige Monate"}
              value={item.partialMonth}
              options={partialMonthOptions}
              onChange={(partialMonth) => update({ partialMonth })}
            />
            <OwnValidityFields label={label} value={item} onChange={update} />
            <SecondaryButton
              onPress={() =>
                onChange({ allowances: value.allowances.filter((entry) => entry.id !== item.id) })
              }
            >
              {label + " entfernen"}
            </SecondaryButton>
          </FormSection>
        );
      })}
    </>
  );
}
