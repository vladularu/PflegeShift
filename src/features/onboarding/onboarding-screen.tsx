import { router } from "expo-router";
import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { usePflegeShiftProfile } from "@/application/pflegeshift-provider";
import { FEDERAL_STATES, FEDERAL_STATE_LABELS, type FederalState } from "@/domain/types";
import { ValidationError } from "@/domain/validation";
import { userFacingErrorMessage } from "@/domain/errors";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { DropdownField, Field, PrimaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { focusInvalidField, weeklyHoursFieldError } from "@/ui/form-validation";

export function parseWeeklyHours(value: string): number {
  const hours = Number(value.replace(",", "."));
  if (!Number.isFinite(hours)) {
    throw new ValidationError("Bitte gültige Wochenstunden angeben.");
  }
  return Math.round(hours * 60);
}

export function OnboardingScreen() {
  const palette = usePalette();
  const { updateProfile } = usePflegeShiftProfile();
  const [federalState, setFederalState] = useState<FederalState>("NW");
  const [weeklyHours, setWeeklyHours] = useState("38,5");
  const [weeklyHoursError, setWeeklyHoursError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const weeklyHoursRef = useRef<TextInput>(null);

  async function submit() {
    const fieldError = weeklyHoursFieldError(weeklyHours);
    setWeeklyHoursError(fieldError);
    if (fieldError) {
      setError(fieldError);
      focusInvalidField(weeklyHoursRef, fieldError);
      return;
    }
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
      setError(userFacingErrorMessage(submitError, "Einrichtung fehlgeschlagen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen bottomPadding={40}>
      <View style={{ gap: SPACING.sm, paddingTop: SPACING.sm }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.primary, ...TYPOGRAPHY.overline }}
        >
          LOKAL · PRIVAT · OFFLINE
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.hero }}
        >
          Dein Dienstplan beginnt hier.
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
        >
          Diese zwei Angaben reichen für Feiertage sowie Soll- und Iststunden. Du kannst sie später
          jederzeit ändern.
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
          error={weeklyHoursError}
          inputRef={weeklyHoursRef}
          label="Stunden pro Woche"
          onChangeText={(value) => {
            setWeeklyHours(value);
            if (weeklyHoursError) setWeeklyHoursError(null);
          }}
          placeholder="38,5"
          returnKeyType="done"
          value={weeklyHours}
        />
      </FormSection>

      <FormStatus error={error} />
      <PrimaryButton disabled={saving} onPress={() => void submit()}>
        {saving ? "Wird gespeichert …" : "PflegeShift starten"}
      </PrimaryButton>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.footnote }}
      >
        Diese Angaben bleiben lokal auf deinem Gerät und können später unter „Mehr“ geändert werden.
      </Text>
    </FormScreen>
  );
}
