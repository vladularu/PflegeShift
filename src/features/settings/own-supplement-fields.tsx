import { DropdownField, Field, SecondaryButton } from "@/ui/form-controls";
import { FormSection } from "@/ui/form-layout";
import { OwnRateFields, OwnValidityFields } from "./own-field-parts";
import { nextOwnId, type OwnRemunerationDraft } from "./own-remuneration-form";

export function OwnSupplementFields({
  value,
  onChange,
}: {
  value: OwnRemunerationDraft;
  onChange: (change: Partial<OwnRemunerationDraft>) => void;
}) {
  const overtime = value.overtime;
  return (
    <>
      <FormSection
        title="Mehr- und Überstunden"
        caption={
          value.baseKind === "hourly"
            ? "Der Stundenlohn enthält bereits alle erfassten Dienstminuten. Überstunden im Dienst ausdrücklich zur Auszahlung bestätigen; nur der Zuschlag kommt zusätzlich hinzu."
            : "Auszahlbare Minuten im jeweiligen Dienst eintragen und bestätigen. Ein Zeitsaldo allein löst keine Auszahlung aus."
        }
      >
        <DropdownField
          label="Überstundenvergütung"
          value={overtime ? "on" : "off"}
          options={[
            { value: "off", label: "Nicht eingerichtet" },
            { value: "on", label: "Einrichten" },
          ]}
          onChange={(choice) =>
            onChange({
              overtime:
                choice === "off"
                  ? null
                  : (overtime ?? { basePayIncluded: value.baseKind === "hourly", premium: null }),
            })
          }
        />
        {overtime ? (
          <>
            <DropdownField
              label="Grundvergütung der Überstunden bereits enthalten"
              value={overtime.basePayIncluded ? "yes" : "no"}
              options={[
                { value: "yes", label: "Ja, nur Zuschlag zusätzlich" },
                { value: "no", label: "Nein, Grundvergütung zusätzlich" },
              ]}
              onChange={(choice) =>
                onChange({ overtime: { ...overtime, basePayIncluded: choice === "yes" } })
              }
            />
            <DropdownField
              label="Überstundenzuschlag"
              value={overtime.premium ? "on" : "off"}
              options={[
                { value: "off", label: "Kein zusätzlicher Zuschlag" },
                { value: "on", label: "Zuschlag einrichten" },
              ]}
              onChange={(choice) =>
                onChange({
                  overtime: {
                    ...overtime,
                    premium:
                      choice === "off"
                        ? null
                        : (overtime.premium ?? { kind: "percent", amount: "" }),
                  },
                })
              }
            />
            {overtime.premium ? (
              <OwnRateFields
                label="Überstundenzuschlag"
                value={overtime.premium}
                onChange={(premium) => onChange({ overtime: { ...overtime, premium } })}
              />
            ) : null}
          </>
        ) : null}
      </FormSection>
      <FormSection
        title="Jahressonderzahlung"
        caption="Zum Beispiel Weihnachtsgeld. Schätzung im gewählten Auszahlungsmonat: persönlicher Jahresbetrag oder Prozentsatz der bestätigten Grundlage, jeweils mal Anspruchsmonate / 12. Keine weitere Teilzeitkürzung. Angaben gelten wiederkehrend innerhalb ihrer Gültigkeit; Anspruch jährlich prüfen."
      >
        <SecondaryButton
          disabled={value.specialPayments.length >= 32}
          onPress={() =>
            onChange({
              specialPayments: [
                ...value.specialPayments,
                {
                  id: nextOwnId(value.specialPayments, "special"),
                  title: "",
                  payoutMonth: "",
                  entitlementMonths: "",
                  kind: "fixed",
                  amount: "",
                  basis: "",
                  validFrom: "",
                  validTo: "",
                },
              ],
            })
          }
        >
          Sonderzahlung hinzufügen
        </SecondaryButton>
      </FormSection>
      {value.specialPayments.map((item, index) => {
        const label = `Sonderzahlung ${index + 1}`;
        const update = (patch: Partial<typeof item>) =>
          onChange({
            specialPayments: value.specialPayments.map((entry) =>
              entry.id === item.id ? { ...entry, ...patch } : entry,
            ),
          });
        return (
          <FormSection key={item.id} title={label}>
            <Field
              label={label + " · Bezeichnung"}
              value={item.title}
              maxLength={100}
              onChangeText={(title) => update({ title })}
            />
            <DropdownField
              label={label + " · Berechnungsart"}
              value={item.kind}
              options={[
                { value: "fixed", label: "Festbetrag" },
                { value: "percent", label: "Prozentsatz" },
              ]}
              onChange={(kind) => kind !== item.kind && update({ kind, amount: "" })}
            />
            <Field
              label={label + (item.kind === "fixed" ? " in Euro" : " in Prozent")}
              value={item.amount}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onChangeText={(amount) => update({ amount })}
            />
            {item.kind === "percent" ? (
              <Field
                label={label + " · Bestätigter Bemessungsbetrag in Euro"}
                value={item.basis}
                placeholder="Unbekannt"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onChangeText={(basis) => update({ basis })}
              />
            ) : null}
            <Field
              label={label + " · Auszahlungsmonat (1–12)"}
              value={item.payoutMonth}
              keyboardType="number-pad"
              returnKeyType="done"
              onChangeText={(payoutMonth) => update({ payoutMonth })}
            />
            <Field
              label={label + " · Anspruchsmonate (0–12)"}
              value={item.entitlementMonths}
              placeholder="Unbekannt"
              keyboardType="number-pad"
              returnKeyType="done"
              onChangeText={(entitlementMonths) => update({ entitlementMonths })}
            />
            <OwnValidityFields label={label} value={item} onChange={update} />
            <SecondaryButton
              onPress={() =>
                onChange({
                  specialPayments: value.specialPayments.filter((entry) => entry.id !== item.id),
                })
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
