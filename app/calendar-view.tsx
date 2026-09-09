import { Stack, useLocalSearchParams } from "expo-router";

import { CalendarViewScreen } from "@/features/calendar/calendar-view-screen";
import { usePalette } from "@/theme/palette";

export default function CalendarViewRoute() {
  const palette = usePalette();
  const { notice } = useLocalSearchParams<{ notice?: string | string[] }>();
  const message =
    notice === "holidays"
      ? "Feiertagsregeln für den gewählten Monat sind nicht verfügbar."
      : notice === "loading"
        ? "Die Kalenderdaten wurden beim Öffnen dieser Ansicht noch geladen."
        : undefined;

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
      <CalendarViewScreen notice={message} />
    </>
  );
}
