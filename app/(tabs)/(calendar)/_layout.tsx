import { Stack } from "expo-router";

import { usePalette } from "@/theme/palette";

export default function CalendarStack() {
  const palette = usePalette();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: palette.background },
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.text,
        headerTitleStyle: { color: palette.text },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Kalender" }} />
    </Stack>
  );
}
