import { DropdownField } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import { UNKNOWN_TVL_CARE, type TvlCareAllowances } from "@/domain/tvl-care-allowances";

export function TvlCareAllowanceFields({
  value,
  onChange,
}: {
  readonly value: TvlCareAllowances | null;
  readonly onChange: (value: TvlCareAllowances) => void;
}) {
  const facts = value ?? UNKNOWN_TVL_CARE;
  const change = (patch: Partial<TvlCareAllowances>) => onChange({ ...facts, ...patch });
  const booleanField = (
    label: string,
    key: "paidEntitlement" | "nursing" | "instructor" | "burnCare",
  ) => (
    <DropdownField
      label={label}
      value={facts[key] === null ? "UNKNOWN" : facts[key] ? "YES" : "NO"}
      onChange={(v) => change({ [key]: v === "UNKNOWN" ? null : v === "YES" })}
      options={[
        { value: "UNKNOWN", label: "Noch ungeklärt" },
        { value: "NO", label: "Nein" },
        { value: "YES", label: "Ja, Voraussetzungen bestätigt" },
      ]}
    />
  );
  return (
    <FormSection
      title="TV-L-Zulagen"
      caption="Persönliche Angaben ab dem Gültigkeitsdatum bis zur nächsten Profiländerung. Bei Änderungen einen neuen Stand anlegen; keine automatische Anspruchsprüfung oder Eingruppierung."
    >
      {booleanField("Entgeltanspruch im Zeitraum", "paidEntitlement")}
      <FormStatus message="Bestätige Entgelt oder Entgeltfortzahlung sowie die Dauer der jeweiligen Tätigkeit für diesen Zeitraum. Unbezahlte Unterbrechungen und Tätigkeitswechsel bitte mit eigenen Gültigkeitsdaten abgrenzen. Diese Angaben betreffen ausschließlich die Zulagen, nicht Kürzungen des Grundentgelts." />
      {booleanField("Pflegezulage", "nursing")}
      <FormStatus message="Teil IV Vorbemerkung 8: passende Pflegetätigkeit an Universitätskliniken, im Maßregelvollzug oder Justizvollzug. Ein Krankenhaus oder die KR-Gruppe allein genügt nicht." />
      {booleanField("Praxisanleitung", "instructor")}
      <FormStatus message="Teil IV Abschnitt 1 Protokollerklärung 3: berufspädagogische Zusatzqualifikation nach Bundesrecht und ausgeübte Praxisanleitung bestätigen." />
      <DropdownField
        label="Besondere Tätigkeitszulage"
        value={facts.clinical ?? "UNKNOWN"}
        onChange={(v) => change({ clinical: v === "UNKNOWN" ? null : v })}
        options={[
          { value: "UNKNOWN", label: "Noch ungeklärt" },
          { value: "NONE", label: "Keine zutreffend" },
          { value: "DIRECT_LOWER", label: "Pflege · Voraussetzungen Nr. 9 b–g" },
          { value: "DIRECT_HIGHER", label: "Pflege · Infektionsbereich oder Intensivmedizin" },
          { value: "LEADER_LOWER", label: "Leitung · Voraussetzungen Nr. 7 b" },
          { value: "LEADER_HIGHER", label: "Leitung · Voraussetzungen Nr. 7 a" },
        ]}
      />
      <FormStatus message="Direkte Pflege KR5–KR9: zeitlich überwiegend die genannten Tätigkeiten, z. B. Geriatrie, bestimmte psychiatrische Bereiche oder Onkologie. Infektionsbereich setzt besondere Infektionsstation/-abteilung voraus; Intensivmedizin Nr. 10. Mehrere Tatbestände werden nicht addiert. Leitung KR9–KR15: alle ausdrücklich ständig unmittelbar unterstellten Pflegekräfte müssen die Voraussetzungen nach Nr. 7 a beziehungsweise b erfüllen." />
      <DropdownField
        label="Funktions-/Stationsleitungszulage"
        value={facts.functionDuty ?? "UNKNOWN"}
        onChange={(v) => change({ functionDuty: v === "UNKNOWN" ? null : v })}
        options={[
          { value: "UNKNOWN", label: "Noch ungeklärt" },
          { value: "NONE", label: "Keine zutreffend" },
          { value: "FUNCTION", label: "Bestätigt · Pflege im Funktionsdienst" },
          { value: "LEADERSHIP", label: "Bestätigt · übertragene Pflegeleitung" },
        ]}
      />
      <FormStatus message="§ 43 Nr. 8: bestätigte Pflegetätigkeit in Funktionsdiagnostik, Endoskopie, Operations- oder Anästhesiedienst oder übertragene Leitung des Pflegepersonals einer oder mehrerer organisatorischer Einheiten. Nicht jede Tätigkeit im Krankenhaus genügt. Keine zusätzliche Zahlung bei konkurrierender besonderer Tätigkeitszulage; ungeklärte Voraussetzungen bleiben offen. Teilzeit und Tätigkeitszeitraum werden berücksichtigt." />
      <DropdownField
        label="Leitungszulage"
        value={
          facts.leadershipAnnexFNumber === null ? "UNKNOWN" : String(facts.leadershipAnnexFNumber)
        }
        onChange={(v) =>
          change({
            leadershipAnnexFNumber:
              v === "UNKNOWN" ? null : v === "NONE" ? "NONE" : (Number(v) as 2 | 3 | 4 | 5 | 6 | 7),
          })
        }
        options={[
          { value: "UNKNOWN", label: "Noch ungeklärt" },
          { value: "NONE", label: "Keine zutreffend" },
          { value: "7", label: "Bestätigt · weniger als 75 Pflegepersonen" },
          { value: "6", label: "Bestätigt · 75 bis 149 Pflegepersonen" },
          { value: "5", label: "Bestätigt · 150 bis 299 Pflegepersonen" },
          { value: "4", label: "Bestätigt · 300 bis 599 Pflegepersonen" },
          { value: "3", label: "Bestätigt · 600 bis 899 Pflegepersonen" },
          { value: "2", label: "Bestätigt · ab 900 Pflegepersonen" },
        ]}
      />
      <FormStatus message="Teil IV Abschnitt 2 Nr. 9: Gesamtverantwortung für den Pflegedienst des Krankenhauses/zugeteilten Pflegebereichs, keine weitere übergeordnete Pflegeleitung und ausdrückliche schriftliche Bestellung zur Krankenhausbetriebsleitung. Eine normale Stationsleitung genügt nicht." />
      {booleanField("Schwerbrandpflege nach Nr. 11", "burnCare")}
      <FormStatus message="Gemeint ist qualifizierende Pflege in den genannten Schwerbrandverletzteneinheiten mit Vermittlung durch Feuerwehr Hamburg (KR5–KR9). Tatsächliche Zeiten ohne Pausen unter Gehalt → TV-L-Dienstangaben erfassen. Die geschätzte Monatszahlung wird auf die besondere Tätigkeitszulage angerechnet; fehlende Angaben bleiben ungeklärt." />
    </FormSection>
  );
}
