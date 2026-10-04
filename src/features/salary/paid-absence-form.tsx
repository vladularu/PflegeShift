import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, View } from "react-native";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import type { SavedPaidAbsence } from "@/domain/paid-absence";
import type { ShiftEntry } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { Field, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import { paidAbsenceField, preparePaidAbsence } from "./paid-absence-model";

export interface PaidAbsenceSession {
  readonly month: string;
  readonly shift: ShiftEntry;
  readonly timeZone: string;
  readonly saved: SavedPaidAbsence | null;
}
export function PaidAbsenceForm({
  session,
  onClose,
  onReload,
}: {
  session: PaidAbsenceSession;
  onClose: () => void;
  onReload: () => void;
}) {
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const palette = usePalette();
  const [current, setCurrent] = useState(session.saved);
  const [value, setValue] = useState(() =>
    paidAbsenceField(session.shift, session.timeZone, session.saved),
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
  const liveSaved = history.paidAbsences.find((item) => item.shiftId === session.shift.id) ?? null;
  const changed =
    JSON.stringify(live) !== JSON.stringify(session.shift) ||
    profile?.timeZone !== session.timeZone ||
    JSON.stringify(liveSaved) !== JSON.stringify(current);
  const ready = root.ready && root.error === null && history.status === "ready" && !changed;

  async function save(clear = false) {
    if (!active.current || savingRef.current) return;
    if (!ready) {
      setError("Die Datengrundlage hat sich geändert. Bitte aktuellen Stand laden.");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const input = preparePaidAbsence(
        session.shift,
        session.timeZone,
        current,
        clear ? null : value,
      );
      savingRef.current = true;
      setSaving(true);
      Keyboard.dismiss();
      const result = await history.savePaidAbsence(input);
      if (!active.current) return;
      setCurrent(result);
      if (clear) setValue("");
      setMessage(
        clear
          ? "Bestätigung aufgehoben. Die bezahlte Zeit ist wieder unbekannt."
          : "Bezahlte Abwesenheitszeit gespeichert.",
      );
      successFeedback();
    } catch (cause) {
      if (active.current)
        setError(
          userFacingErrorMessage(
            cause,
            "Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten. Bitte aktuellen Stand prüfen.",
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
      <FormScreen testID="paid-absence-form">
        <FormSection
          title={session.shift.title}
          caption={formatRemunerationDate(session.shift.date)}
        >
          <Field
            label="Bezahlte Zeit (Stunden:Minuten)"
            value={value}
            placeholder="Zum Beispiel 7:42"
            accessibilityHint="Leer bedeutet unbekannt. 0:00 bestätigt ausdrücklich keine bezahlte Zeit."
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            maxLength={5}
            editable={ready && !saving}
            selectTextOnFocus
            onChangeText={(text) => {
              setValue(text);
              setError(null);
              setMessage(null);
            }}
          />
          <FormStatus message="Nur für die eigene Stundenvergütung. Kalender, Sollzeit und Zeitsaldo bleiben unverändert." />
          <FormStatus
            error={
              error ??
              root.error ??
              history.error ??
              (!saving && changed
                ? "Eintrag, Zeitzone oder Bestätigung haben sich geändert. Deine Eingabe bleibt erhalten. Bitte aktuellen Stand laden."
                : null)
            }
          />
          <FormStatus message={message} />
          <PrimaryButton disabled={!ready} busy={saving} onPress={() => void save()}>
            Bezahlte Zeit bestätigen
          </PrimaryButton>
          {current && current.paidMinutes !== null ? (
            <SecondaryButton
              disabled={!ready || saving}
              onPress={() =>
                Alert.alert(
                  "Bestätigung aufheben?",
                  "Nur die bezahlte Zeit wird auf unbekannt gesetzt. Der Kalendereintrag bleibt erhalten.",
                  [
                    { text: "Abbrechen", style: "cancel" },
                    { text: "Aufheben", style: "destructive", onPress: () => void save(true) },
                  ],
                )
              }
            >
              Bestätigung aufheben
            </SecondaryButton>
          ) : null}
        </FormSection>
        <SecondaryButton disabled={saving} onPress={onReload}>
          Aktuellen Stand laden
        </SecondaryButton>
        <SecondaryButton disabled={saving} onPress={onClose}>
          Zurück zur Auswahl
        </SecondaryButton>
      </FormScreen>
    </View>
  );
}
