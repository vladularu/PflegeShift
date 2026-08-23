import { Stack } from "expo-router";

import { usePalette } from "@/theme/palette";

export default function CalendarStack() {
  const palette = usePalette();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: palette.background },
        headerShown: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.text,
        headerTitleStyle: { color: palette.text },
        statusBarStyle: palette.dark ? "light" : "dark",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Kalender" }} />
    </Stack>
  );
}
