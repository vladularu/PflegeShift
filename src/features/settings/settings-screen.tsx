import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState, type ComponentProps } from "react";
import { Alert, ScrollView, View } from "react-native";

import {
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import { FEDERAL_STATE_LABELS } from "@/domain/types";
import { currentMonth } from "@/engine/calendar";
import {
  isDeveloperModeEnabled,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";
import { DEV_TOOLS_AVAILABLE } from "@/infrastructure/dev-tools-policy";
import { APP_RUNTIME_LABEL } from "@/infrastructure/app-version";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { settingsEditorRoute, settingsInfoRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { usePalette } from "@/theme/palette";
import { RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, RowButton, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";

export function SettingsScreen() {
  const palette = usePalette();
  const db = useSQLiteContext();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { workPatternSettings } = usePflegeShiftTariff();
  const calendarPreferences = useCalendarPreferences();
  const [developerMode, setDeveloperModeState] = useState(false);

  useEffect(() => {
    if (!DEV_TOOLS_AVAILABLE) return;
    let active = true;
    void isDeveloperModeEnabled(db).then(
      (enabled) => {
        if (active) setDeveloperModeState(enabled);
      },
      () => {
        if (active) setDeveloperModeState(false);
      },
    );
    return () => {
      active = false;
    };
  }, [db]);

  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (!ready || profile === null) return <LoadingView />;

  async function activateDeveloperMode() {
    if (developerMode) return;
    try {
      await setDeveloperMode(db, true);
      setDeveloperModeState(true);
      if (process.env.EXPO_OS === "ios")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Testlabor aktiviert", "Das interne Testlabor ist jetzt unter Mehr verfügbar.");
    } catch {
      Alert.alert("Aktivierung fehlgeschlagen", "Das Testlabor konnte nicht aktiviert werden.");
    }
  }

  const tariffLabel = profile.tariff
    ? `${profile.tariff.payGroup} · Stufe ${profile.tariff.payLevel} · ${profile.tariff.sector === "BT_K" ? "BT-K" : "BT-B"}`
    : "Nicht eingerichtet";
  const visibleCalendarContentCount = [
    calendarPreferences.showShifts,
    calendarPreferences.showAppointments,
    calendarPreferences.showHolidays,
  ].filter(Boolean).length;
  const calendarDisplayLabel =
    visibleCalendarContentCount === 3
      ? "Dienste, Termine und Feiertage"
      : `${visibleCalendarContentCount} von 3 Inhalten sichtbar`;
  const coverageLabel =
    workPatternSettings.workplaceCoverage === "AROUND_THE_CLOCK"
      ? "24/7-Betrieb"
      : workPatternSettings.workplaceCoverage === "NOT_AROUND_THE_CLOCK"
        ? "Kein 24/7-Betrieb"
        : "Betriebszeit bestätigen";
  const assignmentLabel =
    workPatternSettings.assignment === "PERMANENT"
      ? "dauerhaft zugeordnet"
      : workPatternSettings.assignment === "TEMPORARY"
        ? "vorübergehend zugeordnet"
        : "Zuordnung bestätigen";

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: SPACING.xl, padding: SPACING.lg, paddingBottom: 42 }}
    >
      <View style={{ gap: SPACING.sm }}>
        <SectionHeader title="Planung" />
        <SurfaceCard>
          <RowButton
            leading={<SettingsIcon name="time-outline" />}
            onPress={() => router.push(settingsEditorRoute("WORK"))}
            subtitle={`${FEDERAL_STATE_LABELS[profile.federalState]} · ${(profile.weeklyMinutes / 60).toLocaleString("de-DE")} Std./Woche`}
            title="Arbeitszeitmodell"
          />
          <CardSeparator />
          <RowButton
            leading={<SettingsIcon name="layers-outline" />}
            onPress={() => router.push("/templates")}
            subtitle="Schnellauswahl für den Kalender verwalten"
            title="Dienstvorlagen"
          />
          <CardSeparator />
          <RowButton
            leading={<SettingsIcon name="calendar-outline" />}
            onPress={() => router.push("/calendar-view")}
            subtitle={calendarDisplayLabel}
            title="Kalenderdarstellung"
          />
        </SurfaceCard>
      </View>

      <View style={{ gap: SPACING.sm }}>
        <SectionHeader title="Tarif" />
        <SurfaceCard>
          <RowButton
            leading={<SettingsIcon name="document-text-outline" />}
            onPress={() => router.push(settingsEditorRoute("TARIFF"))}
            subtitle={tariffLabel}
            title="Tarifprofil"
          />
          <CardSeparator />
          <RowButton
            leading={<SettingsIcon name="repeat-outline" />}
            onPress={() => router.push(tariffAssessmentRoute(currentMonth(profile.timeZone)))}
            subtitle={`${coverageLabel} · ${assignmentLabel}`}
            title="Schichtmodell"
          />
        </SurfaceCard>
      </View>

      {DEV_TOOLS_AVAILABLE && developerMode ? (
        <View style={{ gap: SPACING.sm }}>
          <SectionHeader title="Intern" />
          <SurfaceCard>
            <RowButton
              leading={<SettingsIcon name="flask-outline" />}
              onPress={() => router.push("/dev-tools")}
              subtitle="Testdaten sicher erzeugen und zurücksetzen"
              title="Testlabor"
            />
          </SurfaceCard>
        </View>
      ) : null}

      <View style={{ gap: SPACING.sm }}>
        <SectionHeader title="Daten & App" />
        <SurfaceCard>
          <RowButton
            leading={<SettingsIcon name="phone-portrait-outline" />}
            onPress={() => router.push(settingsInfoRoute("STORAGE"))}
            subtitle="SQLite · ausschließlich auf diesem Gerät"
            title="Lokale Datenspeicherung"
          />
          <CardSeparator />
          <RowButton
            leading={<SettingsIcon name="calculator-outline" />}
            onPress={() => router.push(settingsInfoRoute("CALCULATION"))}
            subtitle="Feiertage, Zuschläge und Arbeitszeit"
            title="Berechnungshinweise"
          />
          <CardSeparator />
          <RowButton
            accessibilityHint={
              DEV_TOOLS_AVAILABLE
                ? "Fünf Sekunden gedrückt halten, um das interne Testlabor zu aktivieren."
                : undefined
            }
            delayLongPress={DEV_TOOLS_AVAILABLE ? 5000 : undefined}
            leading={<SettingsIcon name="information-circle-outline" />}
            onLongPress={DEV_TOOLS_AVAILABLE ? () => void activateDeveloperMode() : undefined}
            onPress={() => router.push(settingsInfoRoute("ABOUT"))}
            subtitle={APP_RUNTIME_LABEL}
            title="Über PflegeShift"
          />
        </SurfaceCard>
      </View>
    </ScrollView>
  );
}

function SettingsIcon({ name }: { readonly name: ComponentProps<typeof Ionicons>["name"] }) {
  const palette = usePalette();
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: 34,
        height: 34,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADII.small,
        backgroundColor: palette.primarySoft,
      }}
    >
      <Ionicons color={palette.primary} name={name} size={18} />
    </View>
  );
}
