import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

import {
  useMediShiftProfile,
  useMediShiftStatus,
  useMediShiftTariff,
} from "@/application/medishift-provider";
import { FEDERAL_STATE_LABELS } from "@/domain/types";
import { currentMonth } from "@/engine/calendar";
import {
  isDeveloperModeEnabled,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { settingsInfoRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { usePalette } from "@/theme/palette";
import { CardSeparator, RowButton, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";

export function SettingsScreen() {
  const palette = usePalette();
  const db = useSQLiteContext();
  const { error, ready, reload } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { workPatternSettings } = useMediShiftTariff();
  const calendarPreferences = useCalendarPreferences();
  const [developerMode, setDeveloperModeState] = useState(false);

  useEffect(() => {
    void isDeveloperModeEnabled(db).then(setDeveloperModeState);
  }, [db]);

  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
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
  const visibleCalendarContentCount = [
    calendarPreferences.showShifts,
    calendarPreferences.showAppointments,
    calendarPreferences.showHolidays,
  ].filter(Boolean).length;
  const calendarDisplayLabel = visibleCalendarContentCount === 3
    ? "Dienste, Termine und Feiertage"
    : `${visibleCalendarContentCount} von 3 Inhalten sichtbar`;
  const coverageLabel = workPatternSettings.workplaceCoverage === "AROUND_THE_CLOCK"
    ? "24/7-Betrieb"
    : workPatternSettings.workplaceCoverage === "NOT_AROUND_THE_CLOCK"
      ? "Kein 24/7-Betrieb"
      : "Betriebszeit bestätigen";
  const assignmentLabel = workPatternSettings.assignment === "PERMANENT"
    ? "dauerhaft zugeordnet"
    : workPatternSettings.assignment === "TEMPORARY"
      ? "vorübergehend zugeordnet"
      : "Zuordnung bestätigen";

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 42 }}
    >
      <View style={{ gap: 9 }}>
        <SectionHeader title="Planung" />
        <SurfaceCard>
          <RowButton
            onPress={() => router.push({ pathname: "/settings-editor", params: { section: "WORK" } })}
            subtitle={`${FEDERAL_STATE_LABELS[profile.federalState]} · ${(profile.weeklyMinutes / 60).toLocaleString("de-DE")} Std./Woche`}
            title="Arbeitszeitmodell"
          />
          <CardSeparator />
          <RowButton
            onPress={() => router.push("/templates")}
            subtitle="Schnellauswahl für den Kalender verwalten"
            title="Dienstvorlagen"
          />
          <CardSeparator />
          <RowButton
            onPress={() => router.push("/calendar-view")}
            subtitle={calendarDisplayLabel}
            title="Kalenderdarstellung"
          />
        </SurfaceCard>
      </View>

      <View style={{ gap: 9 }}>
        <SectionHeader title="Tarif" />
        <SurfaceCard>
          <RowButton
            onPress={() => router.push({ pathname: "/settings-editor", params: { section: "TARIFF" } })}
            subtitle={tariffLabel}
            title="Tarifprofil"
          />
          <CardSeparator />
          <RowButton
            onPress={() => router.push(tariffAssessmentRoute(currentMonth(profile.timeZone)))}
            subtitle={`${coverageLabel} · ${assignmentLabel}`}
            title="Schichtmodell"
          />
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
        <SectionHeader title="Daten & App" />
        <SurfaceCard>
          <RowButton
            onPress={() => router.push(settingsInfoRoute("STORAGE"))}
            subtitle="SQLite · ausschließlich auf diesem Gerät"
            title="Lokale Datenspeicherung"
          />
          <CardSeparator />
          <RowButton
            onPress={() => router.push(settingsInfoRoute("CALCULATION"))}
            subtitle="Feiertage, Zuschläge und Arbeitszeit"
            title="Berechnungshinweise"
          />
          <CardSeparator />
          <RowButton
            accessibilityHint="Fünf Sekunden gedrückt halten, um das interne Testlabor zu aktivieren."
            delayLongPress={5000}
            onLongPress={() => void activateDeveloperMode()}
            onPress={() => router.push(settingsInfoRoute("ABOUT"))}
            subtitle="Version 0.1 · Expo SDK 54"
            title="Über MediShift"
          />
        </SurfaceCard>
      </View>
    </ScrollView>
  );
}
