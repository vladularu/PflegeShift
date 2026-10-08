import { Stack, router, useLocalSearchParams } from "expo-router";
import { useContext } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { CalendarDesignScreen } from "@/features/settings/calendar-design-screen";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { SheetBackFooter } from "@/ui/sheet-back-footer";

export default function CalendarDesignRoute() {
  const palette = usePalette();
  const insets = useContext(SafeAreaInsetsContext);
  const { origin, notice } = useLocalSearchParams<{
    origin?: string | string[];
    notice?: string | string[];
  }>();
  const fromSettings = origin === "settings";
  const message =
    notice === "holidays"
      ? "Feiertagsregeln für den gewählten Monat sind nicht verfügbar."
      : notice === "loading"
        ? "Die Kalenderdaten wurden beim Öffnen dieser Ansicht noch geladen."
        : undefined;
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace(fromSettings ? "/more" : "/");
  }
  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <Stack.Screen
        options={{
          title: "Kalender gestalten",
          headerShown: true,
          headerStyle: { backgroundColor: palette.groupedBackground },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
        }}
      />
      <CalendarDesignScreen notice={message} />
      <View
        style={{
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.sm,
          paddingBottom: Math.max(insets?.bottom ?? 0, SPACING.md),
        }}
      >
        <SheetBackFooter
          label={fromSettings ? "Zurück zu Mehr" : "Zurück zum Kalender"}
          onPress={goBack}
        />
      </View>
    </View>
  );
}
