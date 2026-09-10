import { Redirect, Stack } from "expo-router";
import { DEV_TOOLS_AVAILABLE } from "@/infrastructure/dev-tools-policy";
import { CalendarPrototypeScreen } from "@/features/calendar/calendar-prototype-screen";
import { usePalette } from "@/theme/palette";

export default function CalendarPrototypeRoute() {
  const palette = usePalette();
  if (!DEV_TOOLS_AVAILABLE) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen
        options={{
          title: "Kalender-Prototyp",
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          statusBarStyle: palette.dark ? "light" : "dark",
        }}
      />
      <CalendarPrototypeScreen />
    </>
  );
}
