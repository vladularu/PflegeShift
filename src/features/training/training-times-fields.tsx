import { View } from "react-native";
import { Temporal } from "@js-temporal/polyfill";
import type { ShiftEntry } from "@/domain/types";
import { SPACING } from "@/theme/tokens";
import { Field, DropdownField, SecondaryButton } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import {
  emptyInterval,
  isAmbiguousTime,
  type IntervalDraft,
  type TrainingTimesDraft,
} from "./training-times-model";

function Intervals({
  title,
  values,
  shift,
  timeZone,
  editable,
  maxEntries = 96,
  onChange,
}: {
  readonly title: string;
  readonly values: readonly IntervalDraft[];
  readonly shift: ShiftEntry;
  readonly timeZone: string;
  readonly editable: boolean;
  readonly maxEntries?: number;
  readonly onChange: (values: readonly IntervalDraft[]) => void;
}) {
  const overnight = shift.endTime! <= shift.startTime!;
  return (
    <View style={{ gap: SPACING.md }}>
      {values.map((v, index) => (
        <FormSection key={index} title={`${title} ${index + 1}`}>
          {(["start", "end"] as const).map((side) => {
            const label = `${title} ${index + 1} ${side === "start" ? "Beginn" : "Ende"}`;
            const day = side === "start" ? "startNextDay" : "endNextDay";
            const occurrence = side === "start" ? "startOccurrence" : "endOccurrence";
            const patch = (p: Partial<IntervalDraft>) =>
              onChange(values.map((item, i) => (i === index ? { ...item, ...p } : item)));
            return (
              <View key={side} style={{ gap: SPACING.xs }}>
                <Field
                  label={label}
                  value={v[side]}
                  onChangeText={(text) => patch({ [side]: text, [occurrence]: "unknown" })}
                  editable={editable}
                  keyboardType="numbers-and-punctuation"
                  placeholder="HH:MM"
                  maxLength={5}
                  returnKeyType="done"
                />
                {overnight ? (
                  <DropdownField
                    label={`${label} am`}
                    value={v[day] ? "next" : "same"}
                    options={[
                      { label: formatRemunerationDate(shift.date), value: "same" },
                      {
                        label: formatRemunerationDate(
                          Temporal.PlainDate.from(shift.date).add({ days: 1 }).toString(),
                        ),
                        value: "next",
                      },
                    ]}
                    onChange={(value) =>
                      patch({ [day]: value === "next", [occurrence]: "unknown" })
                    }
                  />
                ) : null}
                {isAmbiguousTime(shift.date, v[side], v[day], timeZone) ? (
                  <DropdownField
                    label={`${label}: Zeitumstellung`}
                    value={v[occurrence]}
                    options={[
                      { label: "Vorkommen wählen", value: "unknown" },
                      { label: "Erstes Vorkommen (vor Rückstellung)", value: "earlier" },
                      { label: "Zweites Vorkommen (nach Rückstellung)", value: "later" },
                    ]}
                    onChange={(value) => patch({ [occurrence]: value })}
                  />
                ) : null}
              </View>
            );
          })}
          <SecondaryButton
            disabled={!editable}
            onPress={() => onChange(values.filter((_, i) => i !== index))}
          >
            {title} {index + 1} entfernen
          </SecondaryButton>
        </FormSection>
      ))}
      {values.length < maxEntries ? (
        <SecondaryButton
          disabled={!editable}
          onPress={() => onChange([...values, emptyInterval()])}
        >
          {title} hinzufügen
        </SecondaryButton>
      ) : null}
    </View>
  );
}

export function TrainingTimesFields({
  values,
  shift,
  timeZone,
  editable,
  onChange,
}: {
  readonly values: TrainingTimesDraft;
  readonly shift: ShiftEntry;
  readonly timeZone: string;
  readonly editable: boolean;
  readonly onChange: (patch: Partial<TrainingTimesDraft>) => void;
}) {
  const update = (patch: Partial<TrainingTimesDraft>) => {
    if (editable) onChange(patch);
  };
  return (
    <>
      <FormSection
        title="Tatsächliche Pausen"
        caption="Beginn und Ende jeder Pause. Auch kurze Pausen unverändert erfassen."
      >
        <DropdownField
          label="Pausenlage"
          value={values.pauseMode}
          options={[
            { label: "Noch nicht erfasst", value: "unknown" },
            { label: "Keine Pause bestätigt", value: "none" },
            { label: "Pausenintervalle erfassen", value: "intervals" },
          ]}
          onChange={(pauseMode) =>
            update({
              pauseMode,
              pauses:
                pauseMode === "intervals" && values.pauses.length === 0
                  ? [emptyInterval()]
                  : values.pauses,
            })
          }
        />
        {values.pauseMode === "intervals" ? (
          <Intervals
            title="Pause"
            values={values.pauses}
            shift={shift}
            timeZone={timeZone}
            editable={editable}
            onChange={(pauses) => update({ pauses })}
          />
        ) : null}
      </FormSection>
      {shift.type === "TRAINING" ? (
        <FormSection
          title="Berufsschule"
          caption="Eine Fortbildung ist nicht automatisch Berufsschule. Nur tatsächlichen Unterricht zuordnen."
        >
          <DropdownField
            label="Schulzuordnung"
            value={values.school ? "school" : "none"}
            options={[
              { label: "Keine Schulzuordnung", value: "none" },
              { label: "Als Berufsschule erfassen", value: "school" },
            ]}
            onChange={(value) =>
              update({
                school: value === "school",
                examKind: value === "school" ? "none" : values.examKind,
                travelToWorkInterval: value === "school" ? values.travelToWorkInterval : null,
                travelFromWorkInterval: value === "school" ? values.travelFromWorkInterval : null,
                lessons:
                  value === "school" && values.lessons.length === 0
                    ? [emptyInterval()]
                    : values.lessons,
              })
            }
          />
          {values.school ? (
            <>
              <Intervals
                title="Unterrichtseinheit"
                values={values.lessons}
                shift={shift}
                timeZone={timeZone}
                editable={editable}
                onChange={(lessons) => update({ lessons })}
              />
              <FormStatus message="Jede Unterrichtseinheit einzeln und in zeitlicher Reihenfolge erfassen. Unterrichtspausen oben unter tatsächliche Pausen eintragen." />
              <Field
                label="Wegezeit Schule → Betrieb (Min.)"
                value={values.travelToWork}
                onChangeText={(travelToWork) =>
                  update({ travelToWork, travelToWorkInterval: null })
                }
                keyboardType="number-pad"
                maxLength={3}
                editable={editable}
                placeholder="Unbekannt"
              />
              {Number(values.travelToWork) > 0 ? (
                <>
                  <DropdownField
                    label="Schule → Betrieb zeitlich verortet"
                    value={values.travelToWorkInterval ? "located" : "unknown"}
                    options={[
                      { label: "Noch nicht verortet", value: "unknown" },
                      { label: "Beginn und Ende erfassen", value: "located" },
                    ]}
                    onChange={(value) =>
                      update({
                        travelToWorkInterval: value === "located" ? emptyInterval() : null,
                      })
                    }
                  />
                  {values.travelToWorkInterval ? (
                    <Intervals
                      title="Weg Schule → Betrieb"
                      values={[values.travelToWorkInterval]}
                      shift={shift}
                      timeZone={timeZone}
                      editable={editable}
                      maxEntries={1}
                      onChange={(intervals) =>
                        update({ travelToWorkInterval: intervals[0] ?? null })
                      }
                    />
                  ) : null}
                </>
              ) : null}
              <Field
                label="Wegezeit Betrieb → Schule (Min.)"
                value={values.travelFromWork}
                onChangeText={(travelFromWork) =>
                  update({ travelFromWork, travelFromWorkInterval: null })
                }
                keyboardType="number-pad"
                maxLength={3}
                editable={editable}
                placeholder="Unbekannt"
              />
              {Number(values.travelFromWork) > 0 ? (
                <>
                  <DropdownField
                    label="Betrieb → Schule zeitlich verortet"
                    value={values.travelFromWorkInterval ? "located" : "unknown"}
                    options={[
                      { label: "Noch nicht verortet", value: "unknown" },
                      { label: "Beginn und Ende erfassen", value: "located" },
                    ]}
                    onChange={(value) =>
                      update({
                        travelFromWorkInterval: value === "located" ? emptyInterval() : null,
                      })
                    }
                  />
                  {values.travelFromWorkInterval ? (
                    <Intervals
                      title="Weg Betrieb → Schule"
                      values={[values.travelFromWorkInterval]}
                      shift={shift}
                      timeZone={timeZone}
                      editable={editable}
                      maxEntries={1}
                      onChange={(intervals) =>
                        update({ travelFromWorkInterval: intervals[0] ?? null })
                      }
                    />
                  ) : null}
                </>
              ) : null}
              <FormStatus message="Nur notwendige Wege zwischen Schule und Ausbildungsstätte. Leer bedeutet unbekannt; 0 bestätigt keinen solchen Weg. Bei einem Weg müssen Dauer und Zeitfenster übereinstimmen." />
              <DropdownField
                label="Blockunterricht"
                value={values.block ? "yes" : "no"}
                options={[
                  { label: "Kein Block zugeordnet", value: "no" },
                  { label: "Blockzeitraum erfassen", value: "yes" },
                ]}
                onChange={(value) => update({ block: value === "yes" })}
              />
              {values.block ? (
                <>
                  <Field
                    label="Blockbeginn"
                    value={values.blockStart}
                    onChangeText={(blockStart) => update({ blockStart })}
                    editable={editable}
                    placeholder="TT.MM.JJJJ"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                  <Field
                    label="Blockende"
                    value={values.blockEnd}
                    onChangeText={(blockEnd) => update({ blockEnd })}
                    editable={editable}
                    placeholder="TT.MM.JJJJ"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </FormSection>
      ) : null}
      {shift.type === "TRAINING" ? (
        <FormSection
          title="Prüfung und außerbetriebliche Ausbildung"
          caption="Nur ausdrücklich zuordnen, wenn die Teilnahme tatsächlich stattfindet. Ein Kalendertitel ist kein Nachweis."
        >
          <DropdownField
            label="Prüfungszuordnung"
            value={values.examKind}
            options={[
              { label: "Keine Prüfung zugeordnet", value: "none" },
              { label: "Prüfung erfassen", value: "EXAM" },
              { label: "Außerbetriebliche Ausbildungsmaßnahme", value: "EXTERNAL_TRAINING" },
            ]}
            onChange={(examKind) =>
              update({
                examKind,
                school: examKind === "none" ? values.school : false,
                examTravelToWorkInterval:
                  examKind === values.examKind ? values.examTravelToWorkInterval : null,
                examTravelFromWorkInterval:
                  examKind === values.examKind ? values.examTravelFromWorkInterval : null,
                examParticipation:
                  examKind !== "none" && values.examParticipation.length === 0
                    ? [emptyInterval()]
                    : values.examParticipation,
              })
            }
          />
          {values.examKind !== "none" ? (
            <>
              <DropdownField
                label="Außerhalb der Ausbildungsstätte rechtlich oder vertraglich vorgeschrieben"
                value={values.examRequired}
                options={[
                  { label: "Noch nicht geklärt", value: "unknown" },
                  { label: "Ja, bestätigt", value: "yes" },
                  { label: "Nein", value: "no" },
                ]}
                onChange={(examRequired) => update({ examRequired })}
              />
              {values.examKind === "EXAM" ? (
                <>
                  <DropdownField
                    label="Schriftliche Abschlussprüfung"
                    value={values.examFinalWritten}
                    options={[
                      { label: "Noch nicht geklärt", value: "unknown" },
                      { label: "Ja, bestätigt", value: "yes" },
                      { label: "Nein", value: "no" },
                    ]}
                    onChange={(examFinalWritten) => update({ examFinalWritten })}
                  />
                  {values.examFinalWritten === "yes" ? (
                    <Field
                      label="Unmittelbar vorausgehender Arbeitstag"
                      value={values.examPrecedingWorkDate}
                      onChangeText={(examPrecedingWorkDate) => update({ examPrecedingWorkDate })}
                      editable={editable}
                      placeholder="TT.MM.JJJJ oder unbekannt"
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                    />
                  ) : null}
                </>
              ) : null}
              <Intervals
                title="Teilnahmezeit"
                values={values.examParticipation}
                shift={shift}
                timeZone={timeZone}
                editable={editable}
                onChange={(examParticipation) => update({ examParticipation })}
              />
              <Field
                label="Notwendiger Weg Teilnahmeort → Betrieb (Min.)"
                value={values.examTravelToWork}
                onChangeText={(examTravelToWork) =>
                  update({ examTravelToWork, examTravelToWorkInterval: null })
                }
                keyboardType="number-pad"
                maxLength={3}
                editable={editable}
                placeholder="Unbekannt"
              />
              {Number(values.examTravelToWork) > 0 ? (
                <>
                  <DropdownField
                    label="Teilnahmeort → Betrieb zeitlich verortet"
                    value={values.examTravelToWorkInterval ? "located" : "unknown"}
                    options={[
                      { label: "Noch nicht verortet", value: "unknown" },
                      { label: "Beginn und Ende erfassen", value: "located" },
                    ]}
                    onChange={(value) =>
                      update({
                        examTravelToWorkInterval: value === "located" ? emptyInterval() : null,
                      })
                    }
                  />
                  {values.examTravelToWorkInterval ? (
                    <Intervals
                      title="Weg Teilnahmeort → Betrieb"
                      values={[values.examTravelToWorkInterval]}
                      shift={shift}
                      timeZone={timeZone}
                      editable={editable}
                      maxEntries={1}
                      onChange={(intervals) =>
                        update({ examTravelToWorkInterval: intervals[0] ?? null })
                      }
                    />
                  ) : null}
                </>
              ) : null}
              <Field
                label="Notwendiger Weg Betrieb → Teilnahmeort (Min.)"
                value={values.examTravelFromWork}
                onChangeText={(examTravelFromWork) =>
                  update({ examTravelFromWork, examTravelFromWorkInterval: null })
                }
                keyboardType="number-pad"
                maxLength={3}
                editable={editable}
                placeholder="Unbekannt"
              />
              {Number(values.examTravelFromWork) > 0 ? (
                <>
                  <DropdownField
                    label="Betrieb → Teilnahmeort zeitlich verortet"
                    value={values.examTravelFromWorkInterval ? "located" : "unknown"}
                    options={[
                      { label: "Noch nicht verortet", value: "unknown" },
                      { label: "Beginn und Ende erfassen", value: "located" },
                    ]}
                    onChange={(value) =>
                      update({
                        examTravelFromWorkInterval: value === "located" ? emptyInterval() : null,
                      })
                    }
                  />
                  {values.examTravelFromWorkInterval ? (
                    <Intervals
                      title="Weg Betrieb → Teilnahmeort"
                      values={[values.examTravelFromWorkInterval]}
                      shift={shift}
                      timeZone={timeZone}
                      editable={editable}
                      maxEntries={1}
                      onChange={(intervals) =>
                        update({ examTravelFromWorkInterval: intervals[0] ?? null })
                      }
                    />
                  ) : null}
                </>
              ) : null}
              <FormStatus message="Teilnahme und Pausen als getrennte Intervalle erfassen. Leer gelassene Wege sind unbekannt, 0 bestätigt keinen Weg. Bei einem Weg müssen Dauer und Zeitfenster übereinstimmen. Die gesetzliche Prüfungsbewertung ist noch nicht freigegeben." />
            </>
          ) : null}
        </FormSection>
      ) : null}
    </>
  );
}
