import { Stack } from "expo-router";
import { AppearanceScreen } from "@/features/settings/appearance-screen";
import { usePalette } from "@/theme/palette";
export default function AppearanceRoute() {
  const palette = usePalette();
  return (
    <>
      <Stack.Screen
        options={{
          title: "Darstellung",
          headerShown: true,
          headerStyle: { backgroundColor: palette.groupedBackground },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          contentStyle: { backgroundColor: palette.groupedBackground },
        }}
      />
      <AppearanceScreen />
    </>
  );
}
