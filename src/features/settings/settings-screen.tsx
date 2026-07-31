import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import {
  useMediShiftProfile,
  useMediShiftStatus,
} from "@/application/medishift-provider";
import { FEDERAL_STATE_LABELS } from "@/domain/types";
import {
  isDeveloperModeEnabled,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";
import { usePalette } from "@/theme/palette";
import { CardSeparator, RowButton, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadingView } from "@/ui/loading-view";

export function SettingsScreen() {
  const palette = usePalette();
  const db = useSQLiteContext();
  const { ready } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const [developerMode, setDeveloperModeState] = useState(false);

  useEffect(() => {
    void isDeveloperModeEnabled(db).then(setDeveloperModeState);
  }, [db]);

  if (!ready || profile === null) return <LoadingView />;

  async function activateDeveloperMode() {
    if (developerMode) return;
    await setDeveloperMode(db, true);
    setDeveloperModeState(true);
    if (process.env.EXPO_OS === "ios") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Testlabor aktiviert", "Das interne Testlabor ist jetzt unter Mehr verfügbar.");
  }

  const tariffLabel = profile.tariff
    ? `${profile.tariff.payGroup} · Stufe ${profile.tariff.payLevel} · ${profile.tariff.sector === "BT_K" ? "BT-K" : "BT-B"}`
    : "Nicht eingerichtet";

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 42 }}
    >
      <View style={{ gap: 9 }}>
        <SectionHeader title="Arbeit & Tarif" />
        <SurfaceCard>
          <RowButton
            onPress={() => router.push({ pathname: "/settings-editor", params: { section: "WORK" } })}
            subtitle={`${FEDERAL_STATE_LABELS[profile.federalState]} · ${(profile.weeklyMinutes / 60).toLocaleString("de-DE")} Std./Woche`}
            title="Arbeitszeitmodell"
          />
          <CardSeparator />
          <RowButton
            onPress={() => router.push({ pathname: "/settings-editor", params: { section: "TARIFF" } })}
            subtitle={tariffLabel}
            title="Tarifprofil"
          />
          <CardSeparator />
          <RowButton
            onPress={() => router.push("/templates")}
            subtitle="Schnellauswahl für den Kalender verwalten"
            title="Dienstvorlagen"
          />
        </SurfaceCard>
      </View>

      <View style={{ gap: 9 }}>
        <SectionHeader title="Daten & Sicherheit" />
        <SurfaceCard>
          <RowButton subtitle="SQLite · ausschließlich auf diesem Gerät" title="Lokale Datenspeicherung" />
        </SurfaceCard>
      </View>

      {developerMode ? (
        <View style={{ gap: 9 }}>
          <SectionHeader title="Intern" />
          <SurfaceCard>
            <RowButton onPress={() => router.push("/dev-tools" as never)} subtitle="Testdaten sicher erzeugen und zurücksetzen" title="Testlabor" />
          </SurfaceCard>
        </View>
      ) : null}

      <View style={{ gap: 9 }}>
        <SectionHeader title="App" />
        <SurfaceCard>
          <Pressable
            accessibilityHint="Fünf Sekunden gedrückt halten, um das interne Testlabor zu aktivieren."
            delayLongPress={5000}
            onLongPress={() => void activateDeveloperMode()}
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <RowButton subtitle="Version 0.1 · Expo SDK 54" title="Über MediShift" />
          </Pressable>
          <CardSeparator />
          <RowButton subtitle="Feiertage, Zuschläge und Arbeitszeitberechnung erfolgen lokal." title="Berechnungshinweise" />
        </SurfaceCard>
      </View>
    </ScrollView>
  );
}
