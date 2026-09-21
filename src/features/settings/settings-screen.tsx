import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useContext, useEffect, useState, type ComponentProps } from "react";
import { Alert, Platform, View, useWindowDimensions } from "react-native";

import { PRODUCT_NAME } from "@/brand";
import { usePflegeShiftProfile, usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import {
  isDeveloperModeEnabled,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";
import { DEV_TOOLS_AVAILABLE } from "@/infrastructure/dev-tools-policy";
import { APP_RUNTIME_LABEL } from "@/infrastructure/app-version";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { CalendarPerformanceControls } from "@/features/calendar/calendar-performance-controls";
import { localBackupRoute, settingsInfoRoute } from "@/navigation/routes";
import { usePalette } from "@/theme/palette";
import { AppearanceContext } from "@/theme/appearance-context";
import { THEME_OPTIONS } from "@/theme/theme-catalog";
import { WorkProfileCard } from "./work-profile-card";
import { RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, RowButton, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { successFeedback } from "@/ui/haptics";
import { ScreenScrollView } from "@/ui/screen-layout";
import { TabRootHeader } from "@/ui/tab-root-header";
import { useThemeStatusBar } from "@/ui/use-theme-status-bar";

export function SettingsScreen() {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const subtitleBelow = fontScale >= 1.3;
  useThemeStatusBar();
  const db = useSQLiteContext();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const appearance = useContext(AppearanceContext);
  const themeName = THEME_OPTIONS.find(
    (theme) => theme.id === (appearance?.themeId ?? "standard"),
  )?.name;
  const modeName =
    appearance?.mode === "light" ? "Hell" : appearance?.mode === "dark" ? "Dunkel" : "System";
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
      successFeedback();
      Alert.alert("Testlabor aktiviert", "Das interne Testlabor ist jetzt unter Mehr verfügbar.");
    } catch {
      Alert.alert("Aktivierung fehlgeschlagen", "Das Testlabor konnte nicht aktiviert werden.");
    }
  }

  const visibleCalendarContentCount = [
    calendarPreferences.showShifts,
    calendarPreferences.showAppointments,
    calendarPreferences.showHolidays,
  ].filter(Boolean).length;
  const calendarDisplayLabel =
    visibleCalendarContentCount === 3
      ? "Dienste, Termine und Feiertage"
      : `${visibleCalendarContentCount} von 3 Inhalten sichtbar`;
  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <TabRootHeader surface="groupedBackground" title="Mehr" />
      <ScreenScrollView surface="groupedBackground">
        <WorkProfileCard profile={profile} />
        <View style={{ gap: SPACING.sm }}>
          <SectionHeader title="Deine App" />
          <SurfaceCard>
            <RowButton
              subtitleBelow={subtitleBelow}
              leading={<SettingsIcon name="color-palette-outline" />}
              title="Darstellung"
              subtitle={themeName + " · " + modeName}
              onPress={() => router.push("/appearance")}
            />
            <CardSeparator />
            <RowButton
              subtitleBelow={subtitleBelow}
              leading={<SettingsIcon name="calendar-outline" />}
              title="Kalenderdarstellung"
              subtitle={calendarDisplayLabel}
              onPress={() => router.push("/calendar-view")}
            />
            <CardSeparator />
            <RowButton
              subtitleBelow={subtitleBelow}
              leading={<SettingsIcon name="shield-checkmark-outline" />}
              title="Prüfung"
              subtitle="Freiwillige Planungshinweise anzeigen"
              onPress={() => router.push("/check-settings")}
            />
          </SurfaceCard>
        </View>

        <CalendarPerformanceControls subtitleBelow={subtitleBelow} />
        {DEV_TOOLS_AVAILABLE ? (
          <View style={{ gap: SPACING.sm }}>
            <SectionHeader title="Intern" />
            <SurfaceCard>
              <RowButton
                subtitleBelow={subtitleBelow}
                leading={<SettingsIcon name="sparkles-outline" />}
                onPress={() => router.push({ pathname: "/onboarding", params: { preview: "1" } })}
                subtitle="Ausprobieren, ohne deine Daten zu ändern"
                title="Onboarding testen"
              />
              {developerMode ? (
                <>
                  <CardSeparator />
                  <RowButton
                    subtitleBelow={subtitleBelow}
                    leading={<SettingsIcon name="flask-outline" />}
                    onPress={() => router.push("/dev-tools")}
                    subtitle="Testdaten sicher erzeugen und zurücksetzen"
                    title="Testlabor"
                  />
                </>
              ) : null}
            </SurfaceCard>
          </View>
        ) : null}

        <View style={{ gap: SPACING.sm }}>
          <SectionHeader title="Daten & App" />
          <SurfaceCard>
            {Platform.OS === "ios" ? (
              <>
                <RowButton
                  subtitleBelow={subtitleBelow}
                  leading={<SettingsIcon name="archive-outline" />}
                  onPress={() => router.push(localBackupRoute())}
                  subtitle="Backup-Datei erstellen und sicher ablegen"
                  title="Datensicherung"
                />
                <CardSeparator />
              </>
            ) : null}
            <RowButton
              subtitleBelow={subtitleBelow}
              leading={<SettingsIcon name="phone-portrait-outline" />}
              onPress={() => router.push(settingsInfoRoute("STORAGE"))}
              subtitle="SQLite · ausschließlich auf diesem Gerät"
              title="Lokale Datenspeicherung"
            />
            <CardSeparator />
            <RowButton
              subtitleBelow={subtitleBelow}
              leading={<SettingsIcon name="calculator-outline" />}
              onPress={() => router.push(settingsInfoRoute("CALCULATION"))}
              subtitle="Feiertage, Zuschläge und Arbeitszeit"
              title="Berechnungshinweise"
            />
            <CardSeparator />
            <RowButton
              subtitleBelow={subtitleBelow}
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
              title={`Über ${PRODUCT_NAME}`}
            />
          </SurfaceCard>
        </View>
      </ScreenScrollView>
    </View>
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
