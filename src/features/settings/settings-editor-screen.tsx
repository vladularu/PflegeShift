import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";

import {
  useMediShiftProfile,
  useMediShiftStatus,
} from "@/application/medishift-provider";
import {
  FEDERAL_STATES,
  FEDERAL_STATE_LABELS,
  PAY_GROUPS,
  PAY_LEVELS,
  type FederalState,
  type PayGroup,
  type PayLevel,
  type TariffSector,
} from "@/domain/types";
import { parseWeeklyHours } from "@/features/onboarding/onboarding-screen";
import { resolveTariffUpdate } from "@/features/settings/profile-update";
import { usePalette } from "@/theme/palette";
import { SectionHeader, SurfaceCard } from "@/ui/design-system";
import { DropdownField, Field, PrimaryButton } from "@/ui/form-controls";
import { LoadingView } from "@/ui/loading-view";

export function SettingsEditorScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = params.section === "TARIFF" ? "TARIFF" : "WORK";
  const { ready, error: dataError } = useMediShiftStatus();
  const { profile, updateProfile } = useMediShiftProfile();
  const [federalState, setFederalState] = useState<FederalState>("NW");
  const [weeklyHours, setWeeklyHours] = useState("38,5");
  const [payGroup, setPayGroup] = useState<PayGroup>("P8");
  const [payLevel, setPayLevel] = useState<PayLevel>(4);
  const [sector, setSector] = useState<TariffSector>("BT_K");
  const [fullTimeHours, setFullTimeHours] = useState("38,5");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFederalState(profile.federalState);
    setWeeklyHours(String(profile.weeklyMinutes / 60).replace(".", ","));
    if (profile.tariff) {
      setPayGroup(profile.tariff.payGroup);
      setPayLevel(profile.tariff.payLevel);
      setSector(profile.tariff.sector);
      setFullTimeHours(String(profile.tariff.fullTimeWeeklyMinutes / 60).replace(".", ","));
    } else {
      setFullTimeHours(profile.federalState === "BW" ? "39" : "38,5");
    }
  }, [profile]);

  if (!ready || profile === null) return <LoadingView />;

  async function submit() {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      await updateProfile({
        federalState,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: profile?.timeZone ?? "Europe/Berlin",
        tariff: resolveTariffUpdate(
          section,
          profile?.tariff ?? null,
          {
            payGroup,
            payLevel,
            sector,
            fullTimeWeeklyMinutes: parseWeeklyHours(fullTimeHours),
          },
        ),
      });
      setMessage("Einstellungen gespeichert.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 18, padding: 16, paddingBottom: 38 }}
    >
      <Stack.Screen options={{ title: section === "WORK" ? "Arbeitszeitmodell" : "Tarifprofil" }} />
      {section === "WORK" ? (
        <>
          <SectionHeader title="Bundesland" caption="Wird für landesspezifische Feiertage verwendet." />
          <SurfaceCard style={{ padding: 14 }}>
            <DropdownField
              label="Bundesland"
              onChange={setFederalState}
              options={FEDERAL_STATES.map((state) => ({ value: state, label: FEDERAL_STATE_LABELS[state] }))}
              value={federalState}
            />
          </SurfaceCard>
          <SurfaceCard style={{ padding: 16 }}>
            <Field
              keyboardType="decimal-pad"
              label="Wochenarbeitszeit in Stunden"
              onChangeText={setWeeklyHours}
              value={weeklyHours}
            />
          </SurfaceCard>
        </>
      ) : (
        <>
          <SectionHeader title="Arbeitsbereich" />
          <SurfaceCard style={{ padding: 14 }}>
            <DropdownField
              label="Tarifbereich"
              onChange={setSector}
              options={[
                { value: "BT_K", label: "Krankenhaus · BT-K" },
                { value: "BT_B", label: "Pflege · BT-B" },
              ]}
              value={sector}
            />
          </SurfaceCard>
          <SectionHeader title="Entgeltgruppe" />
          <SurfaceCard style={{ padding: 14 }}>
            <DropdownField
              label="Entgeltgruppe"
              onChange={setPayGroup}
              options={PAY_GROUPS.map((group) => ({ value: group, label: group }))}
              value={payGroup}
            />
          </SurfaceCard>
          <SectionHeader title="Stufe" />
          <SurfaceCard style={{ padding: 14 }}>
            <DropdownField
              label="Stufe"
              onChange={setPayLevel}
              options={PAY_LEVELS.map((level) => ({ value: level, label: `Stufe ${level}` }))}
              value={payLevel}
            />
          </SurfaceCard>
          <SurfaceCard style={{ padding: 16 }}>
            <Field
              keyboardType="decimal-pad"
              label="Tarifliche Vollzeit pro Woche"
              onChangeText={setFullTimeHours}
              value={fullTimeHours}
            />
          </SurfaceCard>
        </>
      )}
      {message ? <Text style={{ color: palette.success, fontWeight: "700" }}>{message}</Text> : null}
      {error || dataError ? <Text accessibilityRole="alert" style={{ color: palette.danger, fontWeight: "700" }}>{error ?? dataError}</Text> : null}
      <PrimaryButton disabled={saving} onPress={() => void submit()}>
        {saving ? "Wird gespeichert …" : "Speichern"}
      </PrimaryButton>
    </ScrollView>
  );
}
