import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, Text, View } from "react-native";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import type { ShiftEntry } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { Field, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import { overtimeAllocationFields, prepareOvertimeAllocation } from "./overtime-allocation-model";

export interface OvertimeAllocationSession {
  readonly month: string;
  readonly shift: ShiftEntry;
  readonly timeZone: string;
  readonly saved: SavedOvertimeAllocation | null;
}

export function OvertimeAllocationForm({
  session,
  onClose,
  onReload,
}: {
  readonly session: OvertimeAllocationSession;
  readonly onClose: () => void;
  readonly onReload: () => void;
}) {
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const palette = usePalette();
  const [current, setCurrent] = useState(session.saved);
  const [fields] = useState(() =>
    overtimeAllocationFields(session.shift, session.timeZone, session.saved),
  );
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((field) => [field.date, field.value])),
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const live =
    entries.find((entry) => entry.kind === "SHIFT" && entry.id === session.shift.id) ?? null;
  const liveSaved =
    history.overtimeAllocations.find((item) => item.shiftId === session.shift.id) ?? null;
  const changed =
    JSON.stringify(live) !== JSON.stringify(session.shift) ||
    profile?.timeZone !== session.timeZone ||
    JSON.stringify(liveSaved) !== JSON.stringify(current);
  const ready = root.ready && root.error === null && history.status === "ready" && !changed;
  const textStyle = { color: palette.text, ...TYPOGRAPHY.body };

  async function save(clear = false) {
    if (!active.current || savingRef.current) return;
    if (!ready) {
      setError(
        "Die Datengrundlage hat sich geändert oder ist noch nicht geladen. Bitte aktuellen Stand laden.",
      );
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const input = clear
        ? {
            shiftId: session.shift.id,
            expectedShiftRevision: session.shift.revision,
            timeZone: session.timeZone,
            expectedRevision: current?.revision ?? 0,
            allocations: null,
          }
        : prepareOvertimeAllocation(session.shift, session.timeZone, current, values);
      savingRef.current = true;
      setSaving(true);
      Keyboard.dismiss();
      const result = await history.saveOvertimeAllocation(input);
      if (!active.current) return;
      setCurrent(result);
      setMessage(
        clear
          ? "Aufteilung aufgehoben. Die Überstunden benötigen eine neue Tageszuordnung."
          : "Tagesaufteilung gespeichert.",
      );
      successFeedback();
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
      <FormScreen testID="overtime-allocation-form">
        <FormSection
          title={session.shift.title}
          caption={formatRemunerationDate(session.shift.date)}
        >
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
            {session.shift.overtimeMinutes} bestätigte Überstundenminuten ·{" "}
            {session.shift.startTime}–{session.shift.endTime}
          </Text>
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
            Ordne die Minuten den tatsächlichen Diensttagen zu. Die Verteilung ändert weder
            Dienstzeit noch Zeitsaldo und ist keine Bestätigung durch den Arbeitgeber.
          </Text>
        </FormSection>
        <FormSection title="Tagesaufteilung">
          {fields.map((field) => (
            <Field
              key={field.date}
              label={`${formatRemunerationDate(field.date)} · Minuten`}
              accessibilityHint={`Ganze Minuten, höchstens ${field.maximumMinutes}. Ohne Anteil 0 eingeben.`}
              value={values[field.date]}
              onChangeText={(value) => {
                setValues((prior) => ({ ...prior, [field.date]: value }));
                setError(null);
                setMessage(null);
              }}
              keyboardType="number-pad"
              maxLength={4}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              editable={ready && !saving}
              selectTextOnFocus
            />
          ))}
          <FormStatus
            error={
              error ??
              root.error ??
              history.error ??
              (!saving && changed
                ? "Dienst, Zeitzone oder Bestätigung haben sich geändert. Deine Eingaben bleiben erhalten. Bitte aktuellen Stand laden."
                : null)
            }
          />
          <FormStatus message={message} />
          {!saving && history.status === "loading" ? (
            <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
              Vergütungsdaten werden geladen.
            </Text>
          ) : null}
          <PrimaryButton disabled={!ready} busy={saving} onPress={() => void save()}>
            Aufteilung bestätigen
          </PrimaryButton>
          {current?.allocations ? (
            <SecondaryButton
              disabled={!ready || saving}
              onPress={() =>
                Alert.alert(
                  "Aufteilung aufheben?",
                  "Nur die Tageszuordnung wird aufgehoben. Dienstzeit und bestätigte Überstundenminuten bleiben erhalten.",
                  [
                    { text: "Abbrechen", style: "cancel" },
                    { text: "Aufheben", style: "destructive", onPress: () => void save(true) },
                  ],
                )
              }
            >
              Aufteilung aufheben
            </SecondaryButton>
          ) : null}
        </FormSection>
        <SecondaryButton disabled={saving} onPress={onReload}>
          Aktuellen Stand laden
        </SecondaryButton>
        <SecondaryButton disabled={saving} onPress={onClose}>
          Zurück zur Dienstauswahl
        </SecondaryButton>
      </FormScreen>
    </View>
  );
}
