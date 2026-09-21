import { AnalysisViewProvider } from "@/features/analysis/analysis-view-preferences";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { PflegeShiftRuntimeProvider } from "@/composition/pflegeshift-runtime-provider";
import { CalendarPreferencesProvider } from "@/features/calendar/calendar-preferences";
import { CheckPreferencesProvider } from "@/features/settings/check-preferences";
import { NotificationFeedbackBridge } from "@/features/notifications/notification-feedback-bridge";
import { SecureDatabaseProvider } from "@/infrastructure/database/secure-database-provider";
import { DEV_TOOLS_AVAILABLE } from "@/infrastructure/dev-tools-policy";
import { ActiveMonthProvider } from "@/navigation/active-month";
import { MOTION } from "@/theme/motion";
import { usePalette } from "@/theme/palette";
import { AppErrorBoundary } from "@/ui/app-error-boundary";
import { FeedbackProvider } from "@/ui/feedback";
import {
  AppearancePreferencesProvider,
  useAppearancePreferences,
} from "@/features/settings/appearance-preferences";
import { LoadingView } from "@/ui/loading-view";

SplashScreen.setOptions({ duration: 300, fade: true });

const ENTRY_EDITOR_SCREEN_OPTIONS = {
  headerShown: false,
  presentation: "transparentModal" as const,
  animation: "none" as const,
  gestureEnabled: false,
  contentStyle: { backgroundColor: "transparent" },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SecureDatabaseProvider>
        <AppearancePreferencesProvider>
          <ThemedApp />
        </AppearancePreferencesProvider>
      </SecureDatabaseProvider>
    </GestureHandlerRootView>
  );
}

function ThemedApp() {
  const palette = usePalette();
  const dark = palette.dark;
  const appearance = useAppearancePreferences();
  if (!appearance.ready) return <LoadingView />;
  const navigationTheme = dark ? DarkTheme : DefaultTheme;

  return (
    <AppErrorBoundary>
      <ActiveMonthProvider>
        <PflegeShiftRuntimeProvider>
          <CalendarPreferencesProvider>
            <CheckPreferencesProvider>
              <AnalysisViewProvider>
                <AppErrorBoundary title="Ansicht konnte nicht angezeigt werden">
                  <ThemeProvider
                    value={{
                      ...navigationTheme,
                      colors: {
                        ...navigationTheme.colors,
                        primary: palette.accent,
                        background: palette.background,
                        card: palette.surface,
                        text: palette.text,
                        border: palette.separator,
                        notification: palette.danger,
                      },
                    }}
                  >
                    <FeedbackProvider>
                      <NotificationFeedbackBridge />
                      <Stack
                        screenOptions={{
                          headerBackButtonDisplayMode: "minimal",
                          headerShadowVisible: false,
                          headerStyle: { backgroundColor: palette.background },
                          headerTintColor: palette.text,
                          headerTitleStyle: { color: palette.text },
                          statusBarStyle: dark ? "light" : "dark",
                          headerTransparent: false,
                        }}
                      >
                        <Stack.Screen
                          name="(tabs)"
                          options={{
                            headerShown: false,
                            statusBarStyle: dark ? "light" : "dark",
                          }}
                        />
                        <Stack.Screen
                          name="onboarding"
                          options={{
                            headerShown: false,
                            presentation: "fullScreenModal",
                          }}
                        />
                        <Stack.Screen name="appearance" options={{ presentation: "card" }} />
                        <Stack.Screen name="work-profile" options={{ presentation: "card" }} />
                        <Stack.Screen name="day-editor" options={ENTRY_EDITOR_SCREEN_OPTIONS} />
                        <Stack.Screen name="shift-editor" options={ENTRY_EDITOR_SCREEN_OPTIONS} />
                        <Stack.Screen
                          name="appointment-editor"
                          options={ENTRY_EDITOR_SCREEN_OPTIONS}
                        />
                        <Stack.Screen
                          name="day-details"
                          options={{
                            title: "Tagesdetails",
                            presentation: "formSheet",
                            contentStyle: { backgroundColor: "transparent" },
                            sheetAllowedDetents: [0.64, 0.92],
                            sheetGrabberVisible: true,
                          }}
                        />
                        <Stack.Screen
                          name="quick-add"
                          options={{
                            headerShown: false,
                            presentation: "card",
                            animation: "slide_from_bottom",
                            animationDuration: MOTION.duration.scene,
                            contentStyle: { backgroundColor: palette.background },
                          }}
                        />
                        <Stack.Screen
                          name="calendar-view"
                          options={{
                            title: "Anzeigeoptionen",
                            presentation: "card",
                            contentStyle: { backgroundColor: palette.background },
                          }}
                        />
                        <Stack.Screen
                          name="info-details"
                          options={{
                            title: "Information",
                            presentation: "formSheet",
                            contentStyle: { backgroundColor: "transparent" },
                            sheetAllowedDetents: [0.52, 0.78],
                            sheetGrabberVisible: true,
                          }}
                        />
                        <Stack.Screen
                          name="data-backup"
                          options={{
                            title: "Datensicherung",
                            presentation: "card",
                            contentStyle: { backgroundColor: palette.groupedBackground },
                          }}
                        />
                        <Stack.Screen
                          name="premium-details"
                          options={{
                            title: "Zeitzuschläge",
                            presentation: "card",
                            contentStyle: { backgroundColor: palette.groupedBackground },
                          }}
                        />
                        <Stack.Screen
                          name="compliance-details"
                          options={{
                            title: "Prüfung",
                            presentation: "card",
                            contentStyle: { backgroundColor: palette.groupedBackground },
                          }}
                        />
                        <Stack.Screen
                          name="tariff-assessment"
                          options={{
                            title: "Schichtzulage",
                            presentation: "formSheet",
                            contentStyle: { backgroundColor: "transparent" },
                            sheetAllowedDetents: [0.78, 1],
                            sheetGrabberVisible: true,
                          }}
                        />
                        <Stack.Screen
                          name="settings-editor"
                          options={{
                            title: "Einstellungen",
                            presentation: "formSheet",
                            contentStyle: { backgroundColor: "transparent" },
                            sheetAllowedDetents: [0.72, 1],
                            sheetGrabberVisible: true,
                          }}
                        />
                        <Stack.Screen
                          name="shift-selection"
                          options={{
                            headerShown: false,
                            presentation: "formSheet",
                            sheetAllowedDetents: [0.85, 1],
                            sheetGrabberVisible: true,
                            contentStyle: { backgroundColor: palette.background },
                          }}
                        />
                        <Stack.Screen
                          name="template-editor"
                          options={{
                            title: "Schicht",
                            presentation: "card",
                            contentStyle: { backgroundColor: palette.background },
                          }}
                        />
                        <Stack.Screen
                          name="location-picker"
                          options={{
                            headerShown: false,
                            presentation: "formSheet",
                            contentStyle: { backgroundColor: palette.surface },
                            sheetAllowedDetents: [0.72, 0.92],
                            sheetCornerRadius: 28,
                            sheetExpandsWhenScrolledToEdge: false,
                            sheetGrabberVisible: false,
                            sheetInitialDetentIndex: 0,
                          }}
                        />
                        <Stack.Screen
                          name="salary"
                          options={{ title: "Gehalt", presentation: "card" }}
                        />
                        <Stack.Screen
                          name="worktime-details"
                          options={{ title: "Stunden", presentation: "card" }}
                        />
                        <Stack.Screen
                          name="annual-details"
                          options={{ title: "Jahresdetails", presentation: "card" }}
                        />
                        {DEV_TOOLS_AVAILABLE ? (
                          <Stack.Screen
                            name="dev-tools"
                            options={{ title: "Testlabor", presentation: "fullScreenModal" }}
                          />
                        ) : null}
                      </Stack>
                    </FeedbackProvider>
                    <StatusBar
                      animated
                      barStyle={dark ? "light-content" : "dark-content"}
                      key={dark ? "dark-status" : "light-status"}
                    />
                  </ThemeProvider>
                </AppErrorBoundary>
              </AnalysisViewProvider>
            </CheckPreferencesProvider>
          </CalendarPreferencesProvider>
        </PflegeShiftRuntimeProvider>
      </ActiveMonthProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
