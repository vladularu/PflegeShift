import { Stack } from "expo-router";
import { usePalette } from "@/theme/palette";

export default function MoreStack() {
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
      <Stack.Screen name="more" options={{ title: "Mehr" }} />
    </Stack>
  );
}
