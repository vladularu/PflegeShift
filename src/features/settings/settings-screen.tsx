import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useMediShift } from "@/application/medishift-provider";
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
import { usePalette } from "@/theme/palette";
import { Field, PrimaryButton } from "@/ui/form-controls";
import { LoadingView } from "@/ui/loading-view";

export function SettingsScreen() {
  const palette = usePalette();
  const { profile, ready, error: dataError, updateProfile } = useMediShift();
  const [federalState, setFederalState] = useState<FederalState>("NW");
  const [weeklyHours, setWeeklyHours] = useState("38,5");
  const [payGroup, setPayGroup] = useState<PayGroup>("P8");
  const [payLevel, setPayLevel] = useState<PayLevel>(4);
  const [sector, setSector] = useState<TariffSector>("BT_K");
  const [fullTimeHours, setFullTimeHours] = useState("38,5");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
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
    }
  }, [profile]);

  if (!ready) return <LoadingView />;

  async function submit() {
    try {
      setError(null);
      setMessage(null);
      await updateProfile({
        federalState,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: "Europe/Berlin",
        tariff: {
          payGroup,
          payLevel,
          sector,
          fullTimeWeeklyMinutes: parseWeeklyHours(fullTimeHours),
        },
      });
      setMessage("Einstellungen gespeichert.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Speichern fehlgeschlagen.");
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 22, padding: 18, paddingBottom: 40 }}
    >
      <View
        style={{
          gap: 5,
          borderRadius: 18,
          borderCurve: "continuous",
          backgroundColor: palette.primarySoft,
          padding: 16,
        }}
      >
        <Text selectable style={{ color: palette.primary, fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>
          MEDISHIFT 0.1
        </Text>
        <Text selectable style={{ color: palette.text, fontSize: 17, fontWeight: "800" }}>
          Deine Daten bleiben auf diesem Gerät.
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 13, lineHeight: 19 }}>
          Kein Konto, kein Backend und keine Internetverbindung erforderlich.
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
                  paddingHorizontal: 11,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: selected ? palette.primary : palette.text, fontSize: 11, fontWeight: "700" }}>
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
        value={weeklyHours}
      />

      <View style={{ gap: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 18, backgroundColor: palette.surface, padding: 14 }}>
        <View style={{ gap: 4 }}>
          <Text selectable style={{ color: palette.text, fontSize: 17, fontWeight: "900" }}>TVöD-P Tarifprofil</Text>
          <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 18 }}>
            Gruppe, Stufe und Arbeitsbereich bestimmen Tabellenentgelt und Zuschlagsbasis.
          </Text>
        </View>
        <Text selectable style={{ color: palette.text, fontWeight: "800" }}>Arbeitsbereich</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["BT_K", "BT_B"] as const).map((item) => (
            <Choice
              key={item}
              label={item === "BT_K" ? "Krankenhaus · BT-K" : "Pflege/Betreuung · BT-B"}
              selected={sector === item}
              onPress={() => {
                setSector(item);
                setFullTimeHours(item === "BT_K" && federalState !== "BW" ? "38,5" : "39");
              }}
            />
          ))}
        </View>
        <Text selectable style={{ color: palette.text, fontWeight: "800" }}>Entgeltgruppe</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {PAY_GROUPS.map((group) => (
            <Choice key={group} label={group} selected={payGroup === group} onPress={() => setPayGroup(group)} compact />
          ))}
        </View>
        <Text selectable style={{ color: palette.text, fontWeight: "800" }}>Stufe</Text>
        <View style={{ flexDirection: "row", gap: 7 }}>
          {PAY_LEVELS.map((level) => (
            <Choice key={level} label={String(level)} selected={payLevel === level} onPress={() => setPayLevel(level)} compact />
          ))}
        </View>
        <Field
          label="Tarifliche Vollzeit pro Woche"
          keyboardType="decimal-pad"
          onChangeText={setFullTimeHours}
          value={fullTimeHours}
        />
      </View>

      {message ? <Text selectable style={{ color: palette.primary, fontWeight: "700" }}>{message}</Text> : null}
      {error || dataError ? (
        <Text accessibilityRole="alert" selectable style={{ color: palette.danger, fontWeight: "700" }}>
          {error ?? dataError}
        </Text>
      ) : null}

      <PrimaryButton onPress={() => void submit()}>Einstellungen speichern</PrimaryButton>

      <View style={{ gap: 5, paddingTop: 8 }}>
        <Text selectable style={{ color: palette.text, fontWeight: "800" }}>Berechnungsgrundlage</Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 13, lineHeight: 19 }}>
          Sollzeit: Wochenstunden ÷ 5 × Werktage. Bundesweite und landesweite Feiertage werden berücksichtigt; kommunale Ausnahmen noch nicht.
        </Text>
      </View>
    </ScrollView>
  );
}

function Choice({
  label,
  selected,
  onPress,
  compact = false,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly compact?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 42,
        minWidth: compact ? 48 : undefined,
        flex: compact ? undefined : 1,
        flexGrow: compact ? 0 : 1,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: selected ? palette.primary : palette.border,
        borderRadius: 12,
        backgroundColor: selected ? palette.primarySoft : palette.surface,
        paddingHorizontal: 8,
      }}
    >
      <Text style={{ color: selected ? palette.primary : palette.text, fontSize: 11, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
