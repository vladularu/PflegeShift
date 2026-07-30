import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useMediShift } from "@/application/medishift-provider";
import {
  FEDERAL_STATES,
  FEDERAL_STATE_LABELS,
  type FederalState,
} from "@/domain/types";
import { ValidationError } from "@/domain/validation";
import { usePalette } from "@/theme/palette";
import { Field, PrimaryButton } from "@/ui/form-controls";

export function parseWeeklyHours(value: string): number {
  const hours = Number(value.replace(",", "."));
  if (!Number.isFinite(hours)) {
    throw new ValidationError("Bitte gültige Wochenstunden angeben.");
  }
  return Math.round(hours * 60);
}

export function OnboardingScreen() {
  const palette = usePalette();
  const { updateProfile } = useMediShift();
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 24, padding: 20, paddingBottom: 40 }}
    >
      <View style={{ gap: 8 }}>
        <Text selectable style={{ color: palette.primary, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }}>
          LOKAL · PRIVAT · OFFLINE
        </Text>
        <Text selectable style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -1 }}>
          Dein Dienstplan beginnt hier.
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 15, lineHeight: 22 }}>
          Diese zwei Angaben reichen für Feiertage sowie Soll- und Iststunden. Du kannst sie später jederzeit ändern.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <Text selectable style={{ color: palette.text, fontSize: 16, fontWeight: "800" }}>
          Bundesland
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {FEDERAL_STATES.map((state) => {
            const selected = state === federalState;
            return (
              <Pressable
                key={state}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFederalState(state)}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? palette.primary : palette.border,
                  borderRadius: 999,
                  backgroundColor: selected ? palette.primarySoft : palette.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: selected ? palette.primary : palette.text, fontSize: 12, fontWeight: "700" }}>
                  {FEDERAL_STATE_LABELS[state]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Field
        label="Wochenarbeitszeit"
        keyboardType="decimal-pad"
        onChangeText={setWeeklyHours}
        placeholder="38,5"
        returnKeyType="done"
        value={weeklyHours}
      />

      {error ? (
        <Text accessibilityRole="alert" selectable style={{ color: palette.danger, fontWeight: "700" }}>
          {error}
        </Text>
      ) : null}

      <PrimaryButton disabled={saving} onPress={() => void submit()}>
        {saving ? "Wird gespeichert …" : "MediShift starten"}
      </PrimaryButton>
    </ScrollView>
  );
}
