import { Stack } from "expo-router";

import { CheckSettingsScreen } from "@/features/settings/check-settings-screen";
import { usePalette } from "@/theme/palette";

export default function CheckSettingsRoute() {
  const palette = usePalette();
  return (
    <>
      <Stack.Screen
        options={{
          title: "Prüfung",
          headerShown: true,
          headerStyle: { backgroundColor: palette.groupedBackground },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          contentStyle: { backgroundColor: palette.groupedBackground },
        }}
      />
      <CheckSettingsScreen />
    </>
  );
}
