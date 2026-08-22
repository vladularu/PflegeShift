import { Stack } from "expo-router";

import { CalendarViewScreen } from "@/features/calendar/calendar-view-screen";
import { usePalette } from "@/theme/palette";

export default function CalendarViewRoute() {
  const palette = usePalette();

  return (
    <>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
        }}
      />
      <CalendarViewScreen />
    </>
  );
}
