import type { AnnualEntitlementReason } from "@/domain/tariff-annual-claim";
import { DropdownField } from "@/ui/form-controls";
import { FormStatus } from "@/ui/form-layout";
import {
  AnnualAnswer,
  AnnualConfirmation,
  AnnualText,
  type TariffAnnualFieldProps,
} from "./tariff-annual-controls";

const months = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const reasons: readonly { value: AnnualEntitlementReason; label: string }[] = [
  { value: "UNKNOWN", label: "Noch unbekannt" },
  { value: "PAY", label: "Anspruch auf Entgelt / Entgeltfortzahlung" },
  { value: "NONE", label: "Kein Entgeltanspruch und keine Ausnahme" },
  { value: "MATERNITY", label: "Mutterschutz – Ausnahme prüfen" },
  { value: "PARENTAL_BIRTH_YEAR", label: "Elternzeit im Geburtsjahr – Ausnahme prüfen" },
  { value: "SICK_PAY_SUPPLEMENT", label: "Krankengeldzuschuss – Ausnahme prüfen" },
  { value: "MILITARY_RETURN", label: "Grundwehr-/Zivildienst – Ausnahme prüfen" },
];
export function AnnualEmploymentFields({ value: d, onChange, disabled }: TariffAnnualFieldProps) {
  const e = d.claim.employment;
  const employment = (change: Partial<typeof e>) =>
    onChange({ ...d, claim: { ...d.claim, employment: { ...e, ...change } } });
  return (
    <>
      <AnnualText
        label="Beschäftigungsbeginn (TT.MM.JJJJ)"
        value={d.start}
        kind="date"
        disabled={disabled}
        onChange={(start) =>
          onChange({ ...d, start, claim: { ...d.claim, employment: { ...e, confirmed: false } } })
        }
      />
      <AnnualText
        label="Beschäftigungsende (TT.MM.JJJJ)"
        value={d.end}
        kind="date"
        placeholder="Leer bei fortbestehender Beschäftigung"
        disabled={disabled}
        onChange={(end) =>
          onChange({ ...d, end, claim: { ...d.claim, employment: { ...e, confirmed: false } } })
        }
      />
      <AnnualConfirmation
        label="Beschäftigungszeitraum geprüft"
        value={e.confirmed}
        onChange={(confirmed) => employment({ confirmed })}
      />
      <FormStatus message="Mit der Bestätigung gilt ein leeres Enddatum als fortbestehende Beschäftigung. Ohne Bestätigung bleibt der Zeitraum ungeklärt." />
      <AnnualAnswer
        label="Unmittelbare Übernahme nach Ausbildung"
        value={e.takeover.immediate}
        onChange={(immediate) => employment({ takeover: { ...e.takeover, immediate } })}
      />
      <AnnualAnswer
        label="Übernahme beim selben Arbeitgeber"
        value={e.takeover.sameEmployer}
        onChange={(sameEmployer) => employment({ takeover: { ...e.takeover, sameEmployer } })}
      />
      <AnnualAnswer
        label="Nach Übernahme am 1. Dezember beschäftigt"
        value={e.takeover.employedDecember1}
        onChange={(employedDecember1) =>
          employment({ takeover: { ...e.takeover, employedDecember1 } })
        }
      />
    </>
  );
}
export function AnnualEntitlementFields({ value: d, onChange }: TariffAnnualFieldProps) {
  return (
    <>
      <FormStatus message="Jeden Monat einzeln prüfen. Ein Ausnahmetatbestand bestätigt noch keinen Anspruch: Die passende Tarifregel und ergänzende Angaben bleiben erforderlich." />
      {d.claim.entitlements.map((row) => (
        <DropdownField
          key={row.month}
          label={months[row.month - 1]}
          value={row.reason}
          options={reasons}
          onChange={(reason) =>
            onChange({
              ...d,
              claim: {
                ...d.claim,
                entitlements: d.claim.entitlements.map((m) =>
                  m.month === row.month ? { ...m, reason } : m,
                ),
              },
            })
          }
        />
      ))}
    </>
  );
}
export function AnnualExceptionFields({ value: d, onChange, disabled }: TariffAnnualFieldProps) {
  const x = d.claim.exceptions,
    a = d.claim.allocation;
  const exceptions = (change: Partial<typeof x>) =>
    onChange({ ...d, claim: { ...d.claim, exceptions: { ...x, ...change } } });
  return (
    <>
      {d.claim.selection.packageId === "tvl-kr-tdl" ? (
        <>
          <AnnualAnswer
            label="TV-L-Altersteilzeit-Ausnahme bei Renteneintritt"
            value={x.tvlLegacyRetirementExit ?? null}
            onChange={(tvlLegacyRetirementExit) =>
              onChange({
                ...d,
                claim: { ...d.claim, version: 2, exceptions: { ...x, tvlLegacyRetirementExit } },
              })
            }
          />
          <FormStatus message="Nur Ja wählen, wenn die Altersteilzeit bis 20.05.2006 vereinbart wurde UND das Arbeitsverhältnis wegen Rentenbezugs vor dem 1. Dezember endet (§20 Abs.6 TV-L). Bei frühem Ausscheiden ist eine ausdrückliche Antwort nötig; unbekannt bedeutet nicht 0 €." />
        </>
      ) : null}
      <AnnualText
        label="Geburtsjahr des Kindes"
        value={d.birthYear}
        disabled={disabled}
        onChange={(birthYear) => onChange({ ...d, birthYear })}
      />
      <AnnualAnswer
        label="Entgeltanspruch vor Beginn der Elternzeit"
        value={x.payBeforeParentalLeave}
        onChange={(payBeforeParentalLeave) => exceptions({ payBeforeParentalLeave })}
      />
      <AnnualAnswer
        label="Rückkehr aus Grundwehr-/Zivildienst vor 1. Dezember"
        value={x.militaryReturnBeforeDecember1}
        onChange={(militaryReturnBeforeDecember1) => exceptions({ militaryReturnBeforeDecember1 })}
      />
      <AnnualAnswer
        label="Aufteilung des Jahresanspruchs erforderlich"
        value={a.required}
        onChange={(required) =>
          onChange({ ...d, claim: { ...d.claim, allocation: { ...a, required } } })
        }
      />
      <FormStatus message="Bei mehreren Teilansprüchen, etwa Ausbildung und anschließender Beschäftigung, muss die Zuordnung bestätigt werden. Zähler ÷ Nenner ergibt die zugeordneten Zwölftel (zum Beispiel 6 ÷ 1 für sechs Zwölftel). Keine automatische Doppelzahlung." />
      <AnnualText
        label="Zugeordnete Zwölftel · Zähler"
        value={d.numerator}
        disabled={disabled}
        onChange={(numerator) => onChange({ ...d, numerator })}
      />
      <AnnualText
        label="Zugeordnete Zwölftel · Nenner"
        value={d.denominator}
        disabled={disabled}
        onChange={(denominator) => onChange({ ...d, denominator })}
      />
    </>
  );
}
