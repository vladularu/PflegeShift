import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "react-native";

import { PflegeShiftProvider } from "@/application/pflegeshift-provider";
import { CalendarPreferencesProvider } from "@/features/calendar/calendar-preferences";
import { SecureDatabaseProvider } from "@/infrastructure/database/secure-database-provider";
import { DEV_TOOLS_AVAILABLE } from "@/infrastructure/dev-tools-policy";
import { ActiveMonthProvider } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { AppErrorBoundary } from "@/ui/app-error-boundary";
import { FeedbackProvider } from "@/ui/feedback";

SplashScreen.setOptions({ duration: 300, fade: true });

export default function RootLayout() {
  const palette = usePalette();
  const dark = palette.dark;

  return (
    <SecureDatabaseProvider>
      <AppErrorBoundary>
        <PflegeShiftProvider>
          <ActiveMonthProvider>
            <CalendarPreferencesProvider>
              <AppErrorBoundary title="Ansicht konnte nicht angezeigt werden">
                <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
                  <FeedbackProvider>
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
                          title: "PflegeShift einrichten",
                          presentation: "fullScreenModal",
                        }}
                      />
                      <Stack.Screen
                        name="day-editor"
                        options={{
                          title: "Eintrag",
                          presentation: "formSheet",
                          contentStyle: { backgroundColor: "transparent" },
                          sheetAllowedDetents: [0.72, 1],
                          sheetGrabberVisible: true,
                        }}
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
                          title: "Neuer Eintrag",
                          presentation: "formSheet",
                          contentStyle: { backgroundColor: "transparent" },
                          sheetAllowedDetents: [0.5, 0.78],
                          sheetGrabberVisible: true,
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
                        name="premium-details"
                        options={{
                          title: "Zeitzuschläge",
                          presentation: "formSheet",
                          contentStyle: { backgroundColor: "transparent" },
                          sheetAllowedDetents: [0.72, 1],
                          sheetGrabberVisible: true,
                        }}
                      />
                      <Stack.Screen
                        name="compliance-details"
                        options={{
                          title: "Arbeitszeitprüfung",
                          presentation: "formSheet",
                          contentStyle: { backgroundColor: "transparent" },
                          sheetAllowedDetents: [0.72, 1],
                          sheetGrabberVisible: true,
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
                        name="template-editor"
                        options={{
                          title: "Schicht",
                          presentation: "card",
                          contentStyle: { backgroundColor: palette.background },
                        }}
                      />
                      <Stack.Screen name="salary" options={{ headerShown: false }} />
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
            </CalendarPreferencesProvider>
          </ActiveMonthProvider>
        </PflegeShiftProvider>
      </AppErrorBoundary>
    </SecureDatabaseProvider>
  );
}
