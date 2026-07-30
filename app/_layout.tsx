import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { MediShiftProvider } from "@/application/medishift-provider";
import { migrateDatabase } from "@/infrastructure/database/migrations";

export default function RootLayout() {
  const dark = useColorScheme() === "dark";

  return (
    <SQLiteProvider databaseName="medishift.db" onInit={migrateDatabase}>
      <MediShiftProvider>
        <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
          <Stack
            screenOptions={{
              headerBackButtonDisplayMode: "minimal",
              headerShadowVisible: false,
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
                title: "Tag planen",
                presentation: "formSheet",
                contentStyle: { backgroundColor: "transparent" },
                sheetAllowedDetents: [0.82, 1],
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
          </Stack>
          <StatusBar style={dark ? "light" : "dark"} />
        </ThemeProvider>
      </MediShiftProvider>
    </SQLiteProvider>
  );
}
