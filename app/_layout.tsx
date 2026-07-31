import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "react-native";

import { MediShiftProvider } from "@/application/medishift-provider";
import { CalendarPreferencesProvider } from "@/features/calendar/calendar-preferences";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import { usePalette } from "@/theme/palette";

export default function RootLayout() {
  const palette = usePalette();
  const dark = palette.dark;

  return (
    <SQLiteProvider databaseName="medishift.db" onInit={migrateDatabase}>
      <MediShiftProvider>
        <CalendarPreferencesProvider>
          <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
            <Stack
              screenOptions={{
                headerBackButtonDisplayMode: "minimal",
                headerShadowVisible: false,
                headerStyle: { backgroundColor: palette.background },
                headerTintColor: palette.text,
                headerTitleStyle: { color: palette.text },
                headerTransparent: false,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="onboarding"
                options={{ title: "MediShift einrichten", presentation: "fullScreenModal" }}
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
                  title: "Kalenderansicht",
                  presentation: "formSheet",
                  contentStyle: { backgroundColor: "transparent" },
                  sheetAllowedDetents: [0.58, 0.86],
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
                  title: "Dienstvorlage",
                  presentation: "formSheet",
                  contentStyle: { backgroundColor: "transparent" },
                  sheetAllowedDetents: [0.88, 1],
                  sheetGrabberVisible: true,
                }}
              />
              <Stack.Screen
                name="templates"
                options={{ title: "Dienstvorlagen" }}
              />
              <Stack.Screen
                name="dev-tools"
                options={{ title: "Testlabor", presentation: "fullScreenModal" }}
              />
            </Stack>
            <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
          </ThemeProvider>
        </CalendarPreferencesProvider>
      </MediShiftProvider>
    </SQLiteProvider>
  );
}
