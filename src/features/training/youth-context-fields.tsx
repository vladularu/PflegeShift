import { useState } from "react";
import { DropdownField, Field, SecondaryButton } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import {
  formatRemunerationDate,
  parseRemunerationDateInput,
} from "@/features/settings/remuneration-editor-values";
import {
  addYouthDayFact,
  removeYouthDayFact,
  youthContextDraft,
  type YouthContextDraft,
} from "./youth-context-model";

const confirmations = [
  ["careInstitution", "Krankenhaus oder Pflegeeinrichtung"],
  ["medicalEmergencyService", "Ärztlicher Notdienst"],
  ["multiShiftOperation", "Mehrschichtbetrieb"],
  ["allWorkAndSchoolRecorded", "Alle Beschäftigungen und Schulzeiten erfasst"],
  ["pausesPredefined", "Pausen standen im Voraus fest"],
  ["otherExceptions", "Weitere individuelle oder tarifliche Ausnahmen"],
] as const;
export function YouthContextFields({
  value,
  editable,
  profileFrom,
  onChange,
}: {
  readonly value: YouthContextDraft | null;
  readonly editable: boolean;
  readonly profileFrom: string;
  readonly onChange: (value: YouthContextDraft | null) => void;
}) {
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayMessage, setDayMessage] = useState<string | null>(null);
  let selectedDate: string | null = null;
  if (value?.dayDate.trim()) {
    try {
      selectedDate = parseRemunerationDateInput(value.dayDate);
    } catch {
      // A partially typed date is not yet an existing confirmation.
    }
  }
  const selectedShortened =
    selectedDate !== null && value?.context.shortenedWorkingDays.includes(selectedDate);
  const selectedHolidayMinutes =
    selectedDate === null ? undefined : value?.context.holidayLostMinutes[selectedDate];
  function changeDay(next: YouthContextDraft) {
    onChange(next);
    setDayError(null);
    setDayMessage(null);
  }
  function applyDay(action: "add" | "remove") {
    if (!editable || value === null) return;
    try {
      const next =
        action === "add"
          ? addYouthDayFact(value, profileFrom)
          : removeYouthDayFact(value, value.dayKind, parseRemunerationDateInput(value.dayDate));
      onChange({ ...next, dayDate: "", holidayMinutes: "" });
      setDayError(null);
      setDayMessage("Tagesangabe vorgemerkt. Bitte das Ausbildungsprofil unten speichern.");
    } catch (cause) {
      setDayError(cause instanceof Error ? cause.message : "Bitte Tagesangabe prüfen.");
      setDayMessage(null);
    }
  }
  if (value === null)
    return (
      <SecondaryButton disabled={!editable} onPress={() => onChange(youthContextDraft())}>
        Angaben zur Jugendprüfung ergänzen
      </SecondaryButton>
    );
  return (
    <FormSection
      title="Angaben zur Jugendprüfung"
      caption="Gültig ab dem Datum dieses Ausbildungsprofils. Ungeklärte Angaben bleiben ausdrücklich offen."
    >
      {confirmations.map(([key, label]) => (
        <DropdownField
          key={key}
          label={label}
          value={value.context[key] === null ? "unknown" : value.context[key] ? "yes" : "no"}
          options={[
            { label: "Noch nicht geklärt", value: "unknown" },
            { label: "Ja", value: "yes" },
            { label: "Nein", value: "no" },
          ]}
          onChange={(selected) => {
            if (editable)
              onChange({
                ...value,
                context: {
                  ...value.context,
                  [key]: selected === "unknown" ? null : selected === "yes",
                },
              });
          }}
        />
      ))}
      <Field
        label="Durchschnittliche tägliche Ausbildungszeit (Minuten)"
        value={value.dailyMinutes}
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={4}
        editable={editable}
        onChangeText={(dailyMinutes) => onChange({ ...value, dailyMinutes })}
      />
      <Field
        label="Durchschnittliche wöchentliche Ausbildungszeit (Minuten)"
        value={value.weeklyMinutes}
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={5}
        editable={editable}
        onChangeText={(weeklyMinutes) => onChange({ ...value, weeklyMinutes })}
      />
      <FormStatus message="Nur bestätigte Vertragswerte eintragen. Leer bleibt unbekannt. Beispiele: 480 Minuten = 8 Stunden; 2310 Minuten = 38,5 Stunden. Tätigkeitsbereich und Ausnahmen werden nicht aus dem Tarif abgeleitet." />
      <DropdownField
        label="Tagesbezogene Bestätigung"
        value={value.dayKind}
        options={[
          { value: "shortened", label: "Verkürzter Arbeitstag" },
          { value: "holiday", label: "Arbeitsausfall am Feiertag" },
        ]}
        onChange={(dayKind) => changeDay({ ...value, dayKind, dayDate: "", holidayMinutes: "" })}
      />
      <Field
        label="Datum der Tagesangabe"
        value={value.dayDate}
        placeholder="TT.MM.JJJJ"
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        maxLength={10}
        editable={editable}
        onChangeText={(dayDate) => changeDay({ ...value, dayDate })}
      />
      {value.dayKind === "holiday" ? (
        <Field
          label="Tatsächlich ausgefallene Arbeitszeit (Minuten)"
          value={value.holidayMinutes}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={4}
          editable={editable}
          onChangeText={(holidayMinutes) => changeDay({ ...value, holidayMinutes })}
        />
      ) : null}
      <FormStatus
        message={
          value.dayKind === "shortened"
            ? "Nur einen tatsächlich auf weniger als acht Stunden verkürzten Werktag bestätigen. Die Prüfung gleicht ihn mit erfasster Arbeits- und Schulzeit derselben Woche ab."
            : "Nur die am gesetzlichen Feiertag tatsächlich ausgefallene Arbeitszeit eintragen; 0 Minuten ausdrücklich bestätigen. Die Feiertagseigenschaft wird aus dem Regelkatalog geprüft."
        }
      />
      {selectedDate !== null &&
      (value.dayKind === "shortened" ? selectedShortened : selectedHolidayMinutes !== undefined) ? (
        <>
          <FormStatus
            message={
              value.dayKind === "shortened"
                ? `Für ${formatRemunerationDate(selectedDate)} ist ein verkürzter Arbeitstag vorgemerkt.`
                : `Für ${formatRemunerationDate(selectedDate)} sind ${selectedHolidayMinutes} Minuten Feiertagsausfall vorgemerkt.`
            }
          />
          <SecondaryButton disabled={!editable} onPress={() => applyDay("remove")}>
            Tagesangabe für dieses Datum entfernen
          </SecondaryButton>
        </>
      ) : (
        <SecondaryButton disabled={!editable} onPress={() => applyDay("add")}>
          Tagesangabe vormerken
        </SecondaryButton>
      )}
      <FormStatus error={dayError} message={dayMessage} />
      <FormStatus
        message={`${value.context.shortenedWorkingDays.length} verkürzte Tage und ${Object.keys(value.context.holidayLostMinutes).length} Feiertagsangaben in diesem Profilstand. Für ältere Angaben das Datum erneut eingeben.`}
      />
      <SecondaryButton disabled={!editable} onPress={() => onChange(null)}>
        Prüfungsangaben dieses Stands zurücknehmen
      </SecondaryButton>
    </FormSection>
  );
}
