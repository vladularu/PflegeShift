import { DropdownField, Field } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import type { TrainingProfileDraft } from "./training-profile-model";
import { YouthContextFields } from "./youth-context-fields";
import { YouthBlockActivityFields } from "./youth-block-activity-fields";
import type { YouthBlockChoice } from "./youth-block-choices";

export function TrainingProfileFields({
  values,
  editable,
  dateEditable,
  blockChoices,
  onChange,
}: {
  readonly values: TrainingProfileDraft;
  readonly editable: boolean;
  readonly dateEditable: boolean;
  readonly blockChoices: readonly YouthBlockChoice[];
  readonly onChange: (patch: Partial<TrainingProfileDraft>) => void;
}) {
  const dateField = (
    key: "effectiveFrom" | "birthDate" | "startedOn" | "expectedEndOn" | "yearConfirmedFrom",
    label: string,
  ) => (
    <Field
      label={label}
      value={values[key]}
      placeholder="TT.MM.JJJJ"
      maxLength={10}
      keyboardType="numbers-and-punctuation"
      returnKeyType="done"
      editable={editable && (key !== "effectiveFrom" || dateEditable)}
      onChangeText={(text) => onChange({ [key]: text })}
    />
  );
  return (
    <>
      <FormSection
        title="Persönliche Angaben"
        caption="Bleiben auf diesem Gerät und sind im lokalen Backup enthalten."
      >
        {dateField("effectiveFrom", "Gültig ab")}
        {dateField("birthDate", "Geburtsdatum (optional)")}
        <DropdownField
          label="Vollzeitschulpflicht"
          value={values.schooling}
          options={[
            { label: "Noch nicht angegeben", value: "unknown" },
            { label: "Ja", value: "yes" },
            { label: "Nein", value: "no" },
          ]}
          onChange={(schooling) => onChange({ schooling })}
        />
        <DropdownField
          label="Beschäftigungsstatus"
          value={values.status}
          options={[
            { label: "Noch nicht angegeben", value: "unknown" },
            { label: "Beschäftigung", value: "employment" },
            { label: "Ausbildung", value: "training" },
          ]}
          onChange={(status) => onChange({ status })}
        />
      </FormSection>
      {values.status === "training" ? (
        <FormSection title="Ausbildung">
          <Field
            label="Ausbildungsberuf"
            value={values.profession}
            maxLength={200}
            editable={editable}
            returnKeyType="done"
            onChangeText={(profession) => onChange({ profession })}
          />
          <DropdownField
            label="Ausbildungsgrundlage"
            value={values.legalBasis}
            options={[
              { label: "Noch nicht geklärt", value: "UNKNOWN" },
              { label: "Pflegeberufegesetz (PflBG)", value: "PFLBG" },
              { label: "Berufsbildungsgesetz (BBiG)", value: "BBIG" },
              { label: "Andere Grundlage", value: "OTHER" },
            ]}
            onChange={(legalBasis) => onChange({ legalBasis })}
          />
          {dateField("startedOn", "Ausbildungsbeginn")}
          {dateField("expectedEndOn", "Voraussichtliches Ende (optional)")}
          <Field
            label="Bestätigtes Ausbildungsjahr (optional)"
            value={values.year}
            maxLength={1}
            keyboardType="number-pad"
            returnKeyType="done"
            editable={editable}
            onChangeText={(year) => onChange({ year })}
          />
          {dateField("yearConfirmedFrom", "Dieses Ausbildungsjahr gilt ab (optional)")}
          <Field
            label="Verkürzung in Monaten (optional)"
            value={values.shorteningMonths}
            maxLength={2}
            keyboardType="number-pad"
            returnKeyType="done"
            editable={editable}
            onChangeText={(shorteningMonths) => onChange({ shorteningMonths })}
          />
          <FormStatus message="Leer bleibt unbekannt. 0 Monate bestätigt keine Verkürzung. Ausbildungsjahr und Tarif werden nicht automatisch geändert." />
        </FormSection>
      ) : null}
      <YouthContextFields
        value={values.youth}
        editable={editable}
        profileFrom={values.effectiveFrom}
        onChange={(youth) => onChange({ youth })}
      />
      {values.status === "training" && values.youth !== null ? (
        <YouthBlockActivityFields
          choices={blockChoices}
          editable={editable}
          profileFrom={values.effectiveFrom}
          value={values.youth}
          onChange={(youth) => onChange({ youth })}
        />
      ) : null}
    </>
  );
}
