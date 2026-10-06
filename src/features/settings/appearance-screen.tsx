import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { CalendarBackgroundControl } from "./calendar-background-control";
import { useCalendarBackground } from "./calendar-background-context";
import { useAppearancePreferences } from "./appearance-preferences";
import { AppearanceCalendarPreview } from "./appearance-calendar-preview";
import { AppearanceModeControl } from "./appearance-mode-control";
import { usePalette } from "@/theme/palette";
import { CONTROL_HEIGHT, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { InlineNotice, RowButton, SurfaceCard } from "@/ui/design-system";
import { ScreenScrollView } from "@/ui/screen-layout";
import { confirmDestructiveAction } from "@/ui/confirm-action";

export function AppearanceScreen() {
  const palette = usePalette();
  const preferences = useAppearancePreferences();
  const background = useCalendarBackground();
  const resetDisabled =
    !preferences.ready ||
    preferences.saving ||
    background.busy ||
    (background.supported && !background.ready);
  function confirmReset() {
    confirmDestructiveAction({
      title: "Darstellung zurücksetzen?",
      message:
        "Modus, Kalenderhintergrund und Bildsichtbarkeit werden auf System, LUNA Standard und Mittel zurückgesetzt. Dein Kalenderfoto wird entfernt. Deine Dienste und Schichtfarben bleiben erhalten.",
      confirmLabel: "Zurücksetzen",
      onConfirm: () => {
        void (async () => {
          if (!background.supported || (await background.reset())) preferences.reset();
        })();
      },
    });
  }
  return (
    <ScreenScrollView surface="groupedBackground">
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ ...TYPOGRAPHY.body, color: palette.textMuted, textAlign: "center" }}
      >
        Dein Kalender. Dein Stil.
      </Text>
      <AppearanceCalendarPreview />
      <SurfaceCard testID="appearance-settings">
        <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ ...TYPOGRAPHY.bodyStrong, color: palette.text }}
          >
            Modus
          </Text>
          <AppearanceModeControl value={preferences.mode} onChange={preferences.setMode} />
        </View>
        <CalendarBackgroundControl />
      </SurfaceCard>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm }}>
        <Ionicons
          name="lock-closed-outline"
          size={18}
          color={palette.textMuted}
          accessible={false}
        />
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ flex: 1, ...TYPOGRAPHY.caption, color: palette.textMuted }}
        >
          Nur auf diesem Gerät. Schichtfarben bleiben erhalten.
        </Text>
      </View>
      {preferences.error ? (
        <View style={{ gap: SPACING.sm }}>
          <InlineNotice message={preferences.error} />
          <RowButton title="Erneut versuchen" onPress={preferences.retry} />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={resetDisabled}
        accessibilityState={{ disabled: resetDisabled }}
        onPress={confirmReset}
        style={({ pressed }) => ({
          minHeight: CONTROL_HEIGHT.regular,
          justifyContent: "center",
          paddingVertical: SPACING.sm,
          opacity: resetDisabled ? 0.5 : pressed ? 0.75 : 1,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.body, color: palette.textMuted }}
        >
          Darstellung zurücksetzen
        </Text>
      </Pressable>
      <View style={{ gap: SPACING.xxs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}
        >
          Änderungen werden automatisch gespeichert.
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}
        >
          {preferences.saving || background.busy
            ? "Wird gespeichert …"
            : preferences.error || background.error
              ? "Die bisherige Auswahl bleibt erhalten."
              : ""}
        </Text>
      </View>
    </ScreenScrollView>
  );
}
