import { useState } from "react";
import { Alert } from "react-native";
import { userFacingErrorMessage } from "@/domain/errors";
import { DropdownField, SecondaryButton } from "@/ui/form-controls";
import { FormStatus } from "@/ui/form-layout";
import { annualPayoutText } from "./annual-payment-model";
import { addTariffBasisMonth } from "./tariff-annual-model";
import {
  AnnualAnswer,
  AnnualConfirmation,
  AnnualText,
  type TariffAnnualFieldProps,
} from "./tariff-annual-controls";

export function AnnualBasisFields({ value: d, onChange, disabled }: TariffAnnualFieldProps) {
  const tval = d.claim.selection.packageId === "tval-pflege-tdl";
  const [newMonth, setNewMonth] = useState("");
  const [selected, setSelected] = useState(d.months[0]?.month ?? "");
  const [error, setError] = useState<string | null>(null);
  const row = d.months.find((m) => m.month === selected);
  const update = (change: Partial<NonNullable<typeof row>>) =>
    onChange({
      ...d,
      months: d.months.map((m) => (m.month === selected ? { ...m, ...change } : m)),
    });
  return (
    <>
      <FormStatus message="Persönliche Bruttobeträge aus den einschlägigen Abrechnungen ergänzen. Leer bedeutet unbekannt; 0 bedeutet ausdrücklich kein Betrag. Keine automatische Übernahme des heutigen Gehalts für frühere Monate." />
      {tval ? (
        <FormStatus message="TVA-L Pflege: Nur das zustehende November-Ausbildungsentgelt nach § 8 Abs. 1 bestätigen. Keine Zulagen, Zuschläge oder Überstunden hinzufügen. Kein Dreimonatsdurchschnitt und keine erneute Teilzeitkürzung. Ein tatsächlicher Teilmonatsbetrag wird nicht automatisch auf einen vollen Monat hochgerechnet." />
      ) : null}
      <AnnualText
        label="Bemessungsmonat hinzufügen (MM.JJJJ)"
        value={newMonth}
        onChange={setNewMonth}
        kind="date"
        disabled={disabled}
      />
      <SecondaryButton
        disabled={disabled}
        onPress={() => {
          try {
            const next = addTariffBasisMonth(d, newMonth);
            onChange(next);
            setSelected(next.months[next.months.length - 1].month);
            setNewMonth("");
            setError(null);
          } catch (cause) {
            setError(userFacingErrorMessage(cause, "Monat konnte nicht ergänzt werden."));
          }
        }}
      >
        Bemessungsmonat ergänzen
      </SecondaryButton>
      <FormStatus error={error} />
      {d.months.length > 0 ? (
        <DropdownField
          label="Bemessungsmonat bearbeiten"
          value={selected}
          options={d.months.map((m) => ({ value: m.month, label: annualPayoutText(m.month) }))}
          onChange={setSelected}
        />
      ) : (
        <FormStatus message="Noch keine Bemessungsbeträge hinterlegt." />
      )}
      {row ? (
        <>
          {(
            [
              ["baseCents", "Grundentgelt in Euro"],
              ["fixedCents", "Feste Bestandteile in Euro"],
              ["variableCents", "Variable Bestandteile in Euro"],
              ["scheduledOvertimeCents", "Dienstplanmäßige Überstunden in Euro"],
            ] as const
          )
            .filter(
              ([key]) =>
                !tval ||
                key === "baseCents" ||
                (row[key].trim() !== "" && Number(row[key].replace(",", ".")) !== 0),
            )
            .map(([key, label]) => (
              <AnnualText
                key={key}
                label={
                  tval && key === "baseCents"
                    ? "Zustehendes November-Ausbildungsentgelt in Euro"
                    : label
                }
                value={row[key]}
                kind="money"
                disabled={disabled}
                onChange={(text) => update({ [key]: text, componentsConfirmed: false })}
              />
            ))}
          {!tval ? (
            <AnnualText
              label="Kalendertage mit berücksichtigungsfähigem Entgelt"
              value={row.paidCalendarDays}
              disabled={disabled}
              onChange={(paidCalendarDays) =>
                update({ paidCalendarDays, componentsConfirmed: false })
              }
            />
          ) : null}
          <AnnualConfirmation
            label="Bestandteile für diesen Monat geprüft"
            value={row.componentsConfirmed}
            onChange={(componentsConfirmed) => update({ componentsConfirmed })}
          />
          <SecondaryButton
            disabled={disabled}
            onPress={() =>
              Alert.alert(
                "Bemessungsmonat entfernen?",
                "Die Eingaben dieses Monats werden beim nächsten Speichern entfernt.",
                [
                  { text: "Abbrechen", style: "cancel" },
                  {
                    text: "Entfernen",
                    style: "destructive",
                    onPress: () => {
                      const months = d.months.filter((m) => m.month !== selected);
                      onChange({ ...d, months });
                      setSelected(months[0]?.month ?? "");
                    },
                  },
                ],
              )
            }
          >
            Bemessungsmonat entfernen
          </SecondaryButton>
        </>
      ) : null}
    </>
  );
}
export function AnnualAlternateBasisFields({
  value: d,
  onChange,
  disabled,
}: TariffAnnualFieldProps) {
  if (d.claim.selection.packageId === "tval-pflege-tdl")
    return (
      <>
        <AnnualText
          label="Bestätigte November-Ausbildungsgrundlage bei Übernahme in Euro"
          value={d.takeoverAmount}
          kind="money"
          disabled={disabled}
          onChange={(takeoverAmount) => onChange({ ...d, takeoverAmount })}
        />
        <FormStatus message="Nur die für den Übernahmefall bestätigte Ausbildungsentgelt-Bemessungsgrundlage eintragen, nicht das neue Arbeitnehmergehalt oder die bereits gekürzte Sonderzahlung. Die Grundlage bei Bedarf mit der Personalstelle klären. Erfolgt die direkte Übernahme im Laufe eines Monats, gehört dieser Monat zum Arbeitnehmeranteil." />
      </>
    );
  return (
    <>
      <AnnualText
        label="Letzter voller Entgeltmonat (MM.JJJJ)"
        value={d.lastFullPayMonth}
        kind="date"
        disabled={disabled}
        onChange={(lastFullPayMonth) => onChange({ ...d, lastFullPayMonth })}
      />
      <FormStatus message="Die Beträge dieses Ersatzmonats zusätzlich unter Bemessungsmonate eintragen. Ob der Ersatzmonat gilt, entscheidet die passende Tarifregel." />
      <AnnualAnswer
        label="Teilzeit während Elternzeit im Geburtsjahr"
        value={d.claim.basis.parentalPartTime}
        onChange={(parentalPartTime) =>
          onChange({ ...d, claim: { ...d.claim, basis: { ...d.claim.basis, parentalPartTime } } })
        }
      />
      <AnnualText
        label="Angepasste monatliche Bemessungsgrundlage in Euro"
        value={d.adjustedAmount}
        kind="money"
        disabled={disabled}
        onChange={(adjustedAmount) => onChange({ ...d, adjustedAmount })}
      />
      <AnnualText
        label="Monatliche Ausbildungsgrundlage bei Übernahme in Euro"
        value={d.takeoverAmount}
        kind="money"
        disabled={disabled}
        onChange={(takeoverAmount) => onChange({ ...d, takeoverAmount })}
      />
      <FormStatus message="Nur bestätigte, für diesen Sonderfall zutreffende Grundlagen eintragen. Nicht den bereits prozentual gekürzten Sonderzahlungsbetrag verwenden." />
    </>
  );
}
export function AnnualActualFields({ value: d, onChange, disabled }: TariffAnnualFieldProps) {
  return (
    <>
      <AnnualConfirmation
        label="Tatsächliche Auszahlung liegt vor"
        value={d.actual}
        onChange={(actual) => onChange({ ...d, actual })}
      />
      {d.actual ? (
        <>
          <AnnualText
            label="Tatsächlicher tariflicher Bruttobetrag in Euro"
            value={d.actualAmount}
            kind="money"
            disabled={disabled}
            onChange={(actualAmount) => onChange({ ...d, actualAmount })}
          />
          <AnnualText
            label="Tariflicher Auszahlungsmonat (MM.JJJJ)"
            value={d.payout}
            kind="date"
            disabled={disabled}
            onChange={(payout) => onChange({ ...d, payout })}
          />
        </>
      ) : null}
      <FormStatus message="Nur die Sonderzahlung aus der Abrechnung eintragen, nicht das gesamte Monatsgehalt. 0 bestätigt ausdrücklich keine Zahlung. Anspruchsjahr und Auszahlungsjahr dürfen abweichen." />
    </>
  );
}
