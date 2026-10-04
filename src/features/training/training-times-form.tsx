import { useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { useTrainingData } from "@/application/training-provider";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { userFacingErrorMessage } from "@/domain/errors";
import {
  isCurrentShiftTraining,
  type SavedShiftTraining,
  type ShiftTrainingData,
} from "@/domain/training-data";
import type { ShiftEntry } from "@/domain/types";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { TrainingTimesFields } from "./training-times-fields";
import { pauseTotal, trainingTimesDraft, trainingTimesFromDraft } from "./training-times-model";

export interface TrainingTimesSession {
  readonly shift: ShiftEntry;
  readonly saved: SavedShiftTraining | null;
  readonly timeZone: string;
}
export function TrainingTimesForm({
  session,
  onClose,
}: {
  readonly session: TrainingTimesSession;
  readonly onClose: () => void;
}) {
  const history = useTrainingData(),
    root = usePflegeShiftStatus(),
    { entries } = usePflegeShiftEntries(),
    { profile } = usePflegeShiftProfile(),
    palette = usePalette();
  const initiallyStale =
    session.saved !== null &&
    !isCurrentShiftTraining(session.saved, session.shift, session.timeZone);
  const [values, setValues] = useState(() =>
    trainingTimesDraft(
      initiallyStale ? null : (session.saved?.data ?? null),
      session.shift,
      session.timeZone,
    ),
  );
  const [current, setCurrent] = useState(session);
  const [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false),
    busy = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const live = entries.find((e) => e.id === current.shift.id);
  const liveDetails = history.shifts.find((e) => e.shiftId === current.shift.id) ?? null;
  const changed =
    !live ||
    live.kind !== "SHIFT" ||
    live.revision !== current.shift.revision ||
    live.updatedAt !== current.shift.updatedAt ||
    live.date !== current.shift.date ||
    JSON.stringify(live) !== JSON.stringify(current.shift) ||
    live.deletedAt !== null ||
    profile?.timeZone !== current.timeZone ||
    JSON.stringify(liveDetails) !== JSON.stringify(current.saved);
  const ready = root.ready && root.error === null && history.status === "ready" && !changed;
  let preview: ShiftTrainingData | null = null;
  try {
    preview = trainingTimesFromDraft(values, current.shift, current.timeZone);
  } catch {
    /* Save displays the precise validation error. */
  }
  const total = preview === null ? null : pauseTotal(preview);
  async function save() {
    if (!ready || busy.current || !active.current) return;
    setError(null);
    setMessage(null);
    let data: ShiftTrainingData;
    try {
      data = trainingTimesFromDraft(values, current.shift, current.timeZone);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bitte Zeiten prüfen.");
      return;
    }
    busy.current = true;
    setSaving(true);
    Keyboard.dismiss();
    try {
      const saved = await history.saveShift({
        shiftId: current.shift.id,
        expectedShiftRevision: current.shift.revision,
        expectedShiftDate: current.shift.date,
        expectedShiftUpdatedAt: current.shift.updatedAt,
        timeZone: current.timeZone,
        expectedRevision: current.saved?.revision ?? 0,
        synchronizeBreakMinutes: true,
        data,
      });
      if (!active.current) return;
      const shift = {
        ...current.shift,
        breakMinutes: pauseTotal(saved.data) ?? current.shift.breakMinutes,
        revision: saved.shiftRevision,
        updatedAt: saved.shiftUpdatedAt,
      };
      setCurrent({ ...current, shift, saved });
      setValues(trainingTimesDraft(saved.data, shift, current.timeZone));
      setMessage("Zeiten gespeichert. Eine gesetzliche Bewertung ist damit noch nicht erfolgt.");
      // Refresh calendar/worktime/remuneration after the atomically changed pause total.
      try {
        await root.reload();
      } catch {
        if (active.current)
          setError(
            "Gespeichert, aber die Ansicht konnte nicht neu geladen werden. Bitte erneut laden.",
          );
      }
    } catch (cause) {
      if (active.current)
        setError(
          userFacingErrorMessage(
            cause,
            "Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Bitte aktuellen Stand prüfen.",
          ),
        );
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs }}>
        <SecondaryButton onPress={() => Keyboard.dismiss()}>Tastatur schließen</SecondaryButton>
      </View>
      <FormScreen testID="training-times-form">
        <FormSection
          title={`${formatRemunerationDate(current.shift.date)} · ${current.shift.title}`}
          caption={`${current.shift.startTime}–${current.shift.endTime} · ${current.timeZone}`}
        >
          {initiallyStale && message === null ? (
            <FormStatus message="Der Dienst wurde seit der letzten Bestätigung geändert. Frühere Zeiten werden nicht automatisch übernommen. Bitte neu erfassen." />
          ) : null}
        </FormSection>
        <TrainingTimesFields
          values={values}
          shift={current.shift}
          timeZone={current.timeZone}
          editable={ready && !saving}
          onChange={(patch) => {
            if (!ready || busy.current) return;
            setValues((old) => ({ ...old, ...patch }));
            setError(null);
            setMessage(null);
          }}
        />
        <FormStatus
          message={
            total === null
              ? "Ohne bestätigte Pausenintervalle bleibt die bisherige Pausensumme im Dienst unverändert."
              : `Beim Speichern werden ${total} Min. Pause im Dienst übernommen (bisher ${current.shift.breakMinutes} Min.). Arbeitszeit und Vergütung werden neu berechnet.`
          }
        />
        <FormStatus
          message={message}
          error={
            error ??
            root.error ??
            history.error ??
            (!saving && changed
              ? "Eintrag oder Schul-/Pausendaten wurden inzwischen geändert. Deine Eingaben bleiben erhalten. Bitte zur Auswahl zurückkehren und neu laden."
              : null)
          }
        />
        <PrimaryButton disabled={!ready} busy={saving} onPress={() => void save()}>
          Zeiten und Pausensumme speichern
        </PrimaryButton>
        {root.error || history.status === "error" || error?.startsWith("Gespeichert,") ? (
          <SecondaryButton disabled={saving} onPress={() => void root.reload()}>
            Daten erneut laden
          </SecondaryButton>
        ) : null}
        <SecondaryButton disabled={saving} onPress={onClose}>
          Zurück zur Auswahl
        </SecondaryButton>
      </FormScreen>
    </View>
  );
}
