import { DropdownField } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import { UNKNOWN_TVAL_CARE, type TvalCareAllowances } from "@/domain/tval-care-allowances";

export function TvalCareAllowanceFields({
  value,
  onChange,
}: {
  readonly value: TvalCareAllowances | null;
  readonly onChange: (value: TvalCareAllowances) => void;
}) {
  const facts = value ?? UNKNOWN_TVAL_CARE;
  const change = (patch: Partial<TvalCareAllowances>) => onChange({ ...facts, ...patch });
  const booleanField = (label: string, key: "paidEntitlement" | "burnCare") => (
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
      title="TVA-L-Tätigkeitszulagen"
      caption="Bestätigte Voraussetzungen ab dem Gültigkeitsdatum. Bei Tätigkeitswechsel oder Unterbrechung einen neuen Vergütungsstand anlegen."
    >
      {booleanField("Entgeltanspruch für TVA-L-Zulagen", "paidEntitlement")}
      <FormStatus message="Diese Angabe betrifft nur Tätigkeitszulagen. Sie ändert nicht dein Grundentgelt und ersetzt keine Prüfung der Entgeltfortzahlung." />
      <DropdownField
        label="TVA-L-Tätigkeitsanspruch"
        value={facts.clinical ?? "UNKNOWN"}
        onChange={(v) => change({ clinical: v === "UNKNOWN" ? null : v })}
        options={[
          { value: "UNKNOWN", label: "Noch ungeklärt" },
          { value: "NONE", label: "Keine zutreffend" },
          { value: "LOWER", label: "Bestätigt · Tätigkeiten Nr. 9 b–g" },
          { value: "HIGHER", label: "Bestätigt · Infektionsstation oder Intensivmedizin" },
        ]}
      />
      <FormStatus message="TVA-L § 8 Abs. 5 a: halber tariflicher Beschäftigtenbetrag. Erforderlich ist überwiegende qualifizierende Pflege nach Teil IV Nr. 9/10, z. B. in den genannten psychiatrischen, geriatrischen oder onkologischen Bereichen. Schwere Infektionskrankheiten erfordern die besondere Infektionsstation; Intensivmedizin die bezeichnete Einheit. Bei mehreren Tatbeständen nur den höchsten bestätigen; der Abteilungsname allein genügt nicht." />
      {booleanField("TVA-L-Schwerbrandpflege nach Nr. 11", "burnCare")}
      <FormStatus message="Nur qualifizierende Pflege in den bezeichneten Schwerbrandverletzteneinheiten mit Vermittlung durch Feuerwehr Hamburg. Tatsächliche Zeiten ohne Pausen sind zusätzlich zu bestätigen. Der Monatsbetrag wird auf eine Tätigkeitszulage nach Nr. 9/10 angerechnet. Unbekannte Angaben bleiben ungeklärt." />
    </FormSection>
  );
}
