import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { useTrainingData } from "@/application/training-provider";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { userFacingErrorMessage } from "@/domain/errors";
import type { SavedTrainingProfile, TrainingProfileData } from "@/domain/training-data";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormStatus } from "@/ui/form-layout";
import { trainingProfileDraft, trainingProfileFromDraft } from "./training-profile-model";
import { TrainingProfileFields } from "./training-profile-fields";
import { youthBlockTrainingChoices } from "./youth-block-choices";
import { parseRemunerationDateInput } from "@/features/settings/remuneration-editor-values";

export interface TrainingProfileSession {
  readonly seed: TrainingProfileData;
  readonly saved: SavedTrainingProfile | null;
}
export function TrainingProfileForm({
  session,
  onClose,
}: {
  readonly session: TrainingProfileSession;
  readonly onClose: () => void;
}) {
  const history = useTrainingData(),
    root = usePflegeShiftStatus(),
    palette = usePalette();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const [values, setValues] = useState(() => trainingProfileDraft(session.seed));
  const [current, setCurrent] = useState(session.saved);
  const [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false),
    savingRef = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const live = current
    ? (history.profiles.find((p) => p.data.effectiveFrom === current.data.effectiveFrom) ?? null)
    : null;
  const changed = current !== null && JSON.stringify(live) !== JSON.stringify(current);
  const ready = history.status === "ready" && root.ready && root.error === null && !changed;
  const blockChoices = useMemo(() => {
    if (!profile) return [];
    let from: string;
    try {
      from = parseRemunerationDateInput(values.effectiveFrom);
    } catch {
      return [];
    }
    const next =
      history.profiles
        .map((saved) => saved.data.effectiveFrom)
        .filter((date) => date > from)
        .sort()[0] ?? null;
    return youthBlockTrainingChoices(
      entries,
      history.shifts,
      profile.timeZone,
      values.effectiveFrom,
      next,
    );
  }, [entries, history.profiles, history.shifts, profile, values.effectiveFrom]);
  async function save() {
    if (!active.current || savingRef.current || !ready) return;
    setError(null);
    setMessage(null);
    let data: TrainingProfileData;
    try {
      data = trainingProfileFromDraft(values);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bitte Eingaben prüfen.");
      return;
    }
    if (current && current.data.effectiveFrom !== data.effectiveFrom) {
      setError("Für ein neues Gültigkeitsdatum bitte einen neuen Stand anlegen.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    Keyboard.dismiss();
    try {
      const saved = await history.saveProfile({ data, expectedRevision: current?.revision ?? 0 });
      if (!active.current) return;
      setCurrent(saved);
      setValues(trainingProfileDraft(saved.data));
      setMessage("Ausbildungsprofil gespeichert. Der Tarif bleibt unverändert.");
    } catch (cause) {
      if (active.current)
        setError(
          userFacingErrorMessage(
            cause,
            "Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Bitte aktuellen Stand prüfen.",
          ),
        );
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs }}>
        <SecondaryButton onPress={() => Keyboard.dismiss()}>Tastatur schließen</SecondaryButton>
      </View>
      <FormScreen testID="training-profile-form">
        <TrainingProfileFields
          values={values}
          editable={ready && !saving}
          dateEditable={current === null}
          blockChoices={blockChoices}
          onChange={(patch) => {
            if (!ready || savingRef.current) return;
            setValues((old) => ({ ...old, ...patch }));
            setError(null);
            setMessage(null);
          }}
        />
        <FormStatus
          error={
            error ??
            root.error ??
            history.error ??
            (!saving && changed
              ? "Dieser Ausbildungsstand wurde inzwischen geändert. Deine Eingabe bleibt erhalten. Bitte zurück zur Auswahl und den aktuellen Stand laden."
              : null)
          }
          message={message}
        />
        <PrimaryButton disabled={!ready} busy={saving} onPress={() => void save()}>
          Ausbildungsprofil speichern
        </PrimaryButton>
        {history.status === "error" ? (
          <SecondaryButton disabled={saving} onPress={() => void history.reload()}>
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
