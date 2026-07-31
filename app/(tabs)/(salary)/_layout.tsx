import { Stack } from "expo-router";

import { usePalette } from "@/theme/palette";

export default function SalaryStack() {
  const palette = usePalette();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: palette.background },
        headerLargeTitle: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.text,
        headerTitleStyle: { color: palette.text },
      }}
    >
      <Stack.Screen name="salary" options={{ title: "Gehalt" }} />
    </Stack>
  );
}
