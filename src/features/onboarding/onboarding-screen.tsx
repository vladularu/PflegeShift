import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { useMediShiftProfile } from "@/application/medishift-provider";
import {
  FEDERAL_STATES,
  FEDERAL_STATE_LABELS,
  type FederalState,
} from "@/domain/types";
import { ValidationError } from "@/domain/validation";
import { usePalette } from "@/theme/palette";
import { DropdownField, Field, PrimaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";

export function parseWeeklyHours(value: string): number {
  const hours = Number(value.replace(",", "."));
  if (!Number.isFinite(hours)) {
    throw new ValidationError("Bitte gültige Wochenstunden angeben.");
  }
  return Math.round(hours * 60);
}

export function OnboardingScreen() {
  const palette = usePalette();
  const { updateProfile } = useMediShiftProfile();
  const [federalState, setFederalState] = useState<FederalState>("NW");
  const [weeklyHours, setWeeklyHours] = useState("38,5");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    try {
      setSaving(true);
      setError(null);
      await updateProfile({
        federalState,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: "Europe/Berlin",
      });
      router.replace("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Einrichtung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen bottomPadding={40}>
      <View style={{ gap: 8, paddingTop: 8 }}>
        <Text selectable style={{ color: palette.primary, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }}>
          LOKAL · PRIVAT · OFFLINE
        </Text>
        <Text maxFontSizeMultiplier={1.35} selectable style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -1 }}>
          Dein Dienstplan beginnt hier.
        </Text>
        <Text maxFontSizeMultiplier={1.45} selectable style={{ color: palette.textMuted, fontSize: 15, lineHeight: 22 }}>
          Diese zwei Angaben reichen für Feiertage sowie Soll- und Iststunden. Du kannst sie später jederzeit ändern.
        </Text>
      </View>

      <FormSection caption="Für deine gesetzlichen Feiertage." title="Bundesland">
        <DropdownField
          label="Bundesland auswählen"
          onChange={setFederalState}
          options={FEDERAL_STATES.map((state) => ({
            value: state,
            label: FEDERAL_STATE_LABELS[state],
          }))}
          value={federalState}
        />
      </FormSection>

      <FormSection caption="Für Sollstunden und Saldo." title="Wochenarbeitszeit">
        <Field
          keyboardType="decimal-pad"
          label="Stunden pro Woche"
          onChangeText={setWeeklyHours}
          placeholder="38,5"
          returnKeyType="done"
          value={weeklyHours}
        />
      </FormSection>

      <FormStatus error={error} />
      <PrimaryButton disabled={saving} onPress={() => void submit()}>
        {saving ? "Wird gespeichert …" : "MediShift starten"}
      </PrimaryButton>
      <Text maxFontSizeMultiplier={1.6} selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17, fontWeight: "500", textAlign: "center" }}>
        Diese Angaben bleiben lokal auf deinem Gerät und können später unter „Mehr“ geändert werden.
      </Text>
    </FormScreen>
  );
}
