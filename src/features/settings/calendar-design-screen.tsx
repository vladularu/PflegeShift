import { Pressable, Text, View } from "react-native";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { CalendarBackgroundControl } from "./calendar-background-control";
import { useCalendarBackground } from "./calendar-background-context";
import { useAppearancePreferences } from "./appearance-preferences";
import { AppearanceCalendarPreview } from "./appearance-calendar-preview";
import { AppearanceModeControl } from "./appearance-mode-control";
import { CalendarDisplayControls } from "./calendar-display-controls";
import { usePalette } from "@/theme/palette";
import { CONTROL_HEIGHT, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CardSeparator, InlineNotice, RowButton, SurfaceCard } from "@/ui/design-system";
import { ScreenScrollView } from "@/ui/screen-layout";
import { confirmDestructiveAction } from "@/ui/confirm-action";

export function CalendarDesignScreen({ notice }: { readonly notice?: string }) {
  const palette = usePalette();
  const appearance = useAppearancePreferences();
  const display = useCalendarPreferences();
  const background = useCalendarBackground();
  const resetDisabled =
    !display.ready ||
    display.saving ||
    background.busy ||
    (background.supported && !background.ready);
  function confirmReset() {
    confirmDestructiveAction({
      title: "Kalenderoptionen zurücksetzen?",
      message:
        "Kalenderhintergrund, Bildsichtbarkeit, sichtbare Inhalte, Dienstbezeichnung, Startzeit und Gesamtdauer werden zurückgesetzt. Dein Kalenderfoto und die Foto-Rückgängig-Möglichkeit werden entfernt. Der appweite Hell-/Dunkel-/Systemmodus, Schichtfarben, Profile und Dienste bleiben erhalten.",
      confirmLabel: "Zurücksetzen",
      onConfirm: () => {
        void (async () => {
          if (!background.supported || (await background.reset())) display.resetDisplay();
        })();
      },
    });
  }
  return (
    <ScreenScrollView
      surface="groupedBackground"
      contentGap={SPACING.md}
      bottomPadding={SPACING.lg}
    >
      {notice ? <InlineNotice message={notice} /> : null}
      <AppearanceCalendarPreview />
      <SurfaceCard testID="appearance-settings">
        <View style={{ padding: SPACING.md }}>
          <AppearanceModeControl
            value={appearance.mode}
            onChange={appearance.setMode}
            disabled={!appearance.ready}
          />
        </View>
        <CardSeparator inset={0} />
        <CalendarBackgroundControl />
      </SurfaceCard>
      {appearance.error ? (
        <View style={{ gap: SPACING.sm }}>
          <InlineNotice message={appearance.error} />
          <RowButton title="Modus erneut speichern" onPress={appearance.retry} />
        </View>
      ) : null}
      <CalendarDisplayControls />
      {display.error ? (
        <View style={{ gap: SPACING.sm }}>
          <InlineNotice message={display.error} />
          <RowButton title="Kalenderoptionen erneut versuchen" onPress={display.retry} />
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
          Kalenderoptionen zurücksetzen
        </Text>
      </Pressable>
      <Text
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}
      >
        {appearance.saving || display.saving || background.busy
          ? "Wird gespeichert …"
          : appearance.error || display.error || background.error
            ? "Nicht alle Änderungen wurden gespeichert."
            : "Änderungen werden automatisch gespeichert."}
      </Text>
    </ScreenScrollView>
  );
}
