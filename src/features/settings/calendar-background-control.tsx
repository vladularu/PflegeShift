import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect } from "react";
import { AccessibilityInfo, Pressable, Text, View, useWindowDimensions } from "react-native";
import { CALENDAR_IMAGE_STRENGTH_OPTIONS } from "@/theme/calendar-image";
import { useCalendarBackground } from "./calendar-background-context";
import { usePalette } from "@/theme/palette";
import { CONTROL_HEIGHT, SPACING, RADII } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CardSeparator, InlineNotice, RowButton } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";

export function CalendarBackgroundControl() {
  const background = useCalendarBackground();
  const palette = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.2;
  const disabled = !background.supported || !background.ready || background.busy;
  const label = background.uri ? "Eigenes Foto" : "LUNA Standard";
  useEffect(() => {
    if (background.canUndoRemoval)
      AccessibilityInfo.announceForAccessibility("Foto entfernt. Rückgängig ist verfügbar.");
  }, [background.canUndoRemoval]);
  return (
    <>
      <CardSeparator inset={0} />
      <View
        accessible
        accessibilityLabel={`Hintergrund, ${label}`}
        style={{
          minHeight: CONTROL_HEIGHT.regular,
          padding: SPACING.lg,
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: SPACING.xxs,
        }}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.bodyStrong, color: palette.text }}
        >
          Hintergrund
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.body, color: palette.textMuted }}
        >
          {label}
        </Text>
      </View>
      {background.uri ? (
        <>
          <CardSeparator inset={0} />
          <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{ ...TYPOGRAPHY.bodyStrong, color: palette.text }}
            >
              Bildsichtbarkeit
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Bildsichtbarkeit"
              style={{
                flexDirection: stacked ? "column" : "row",
                gap: SPACING.xxs,
                padding: SPACING.xxs,
                borderRadius: RADII.control,
                backgroundColor: palette.surfaceMuted,
              }}
            >
              {CALENDAR_IMAGE_STRENGTH_OPTIONS.map((option) => {
                const selected = background.strength === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: selected, disabled }}
                    disabled={disabled}
                    onPress={() => {
                      if (!selected) {
                        selectionFeedback();
                        void background.setStrength(option.value);
                      }
                    }}
                    style={({ pressed }) => ({
                      minHeight: CONTROL_HEIGHT.regular,
                      flex: stacked ? undefined : 1,
                      paddingVertical: SPACING.sm,
                      paddingHorizontal: SPACING.xs,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: RADII.small,
                      backgroundColor: selected ? palette.surfaceRaised : "transparent",
                      opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
                    })}
                  >
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{
                        ...TYPOGRAPHY.label,
                        color: selected ? palette.primary : palette.textSecondary,
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      ) : null}
      <CardSeparator inset={0} />
      <RowButton
        title={background.uri ? "Foto ändern" : "Foto auswählen"}
        disabled={disabled}
        onPress={() => void background.choose()}
        leading={
          <Ionicons name="image-outline" size={24} color={palette.primary} accessible={false} />
        }
      />
      {background.uri ? (
        <>
          <CardSeparator inset={0} />
          <RowButton
            title="Foto entfernen"
            destructive
            disabled={disabled}
            onPress={() => void background.remove()}
            trailing={<></>}
            accessibilityHint="Setzt nur den Kalenderhintergrund zurück. Du kannst das Entfernen rückgängig machen."
            leading={
              <Ionicons name="trash-outline" size={24} color={palette.danger} accessible={false} />
            }
          />
        </>
      ) : null}
      {background.canUndoRemoval ? (
        <>
          <CardSeparator inset={0} />
          <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm }}>
            <Text
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}
            >
              Foto entfernt.
            </Text>
          </View>
          <RowButton
            title="Rückgängig"
            disabled={disabled}
            onPress={() => void background.undoRemove()}
            trailing={<></>}
            accessibilityHint="Stellt dein zuletzt entferntes Kalenderfoto wieder her."
            leading={
              <Ionicons
                name="arrow-undo-outline"
                size={24}
                color={palette.primary}
                accessible={false}
              />
            }
          />
        </>
      ) : null}
      {background.error ? (
        <View style={{ padding: SPACING.lg, gap: SPACING.sm }}>
          <InlineNotice message={background.error} />
          <RowButton
            title="Kalenderbild erneut laden"
            disabled={background.busy}
            onPress={background.retry}
          />
        </View>
      ) : null}
    </>
  );
}
