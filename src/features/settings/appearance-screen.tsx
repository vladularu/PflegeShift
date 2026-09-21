import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAppearancePreferences } from "./appearance-preferences";
import { usePalette } from "@/theme/palette";
import { resolvePalette, THEME_OPTIONS, themeSwatches } from "@/theme/theme-catalog";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { InlineNotice, SectionHeader } from "@/ui/design-system";
import { AppearanceModeControl } from "./appearance-mode-control";
import { ScreenScrollView } from "@/ui/screen-layout";
import { selectionFeedback } from "@/ui/haptics";

export function AppearanceScreen() {
  const palette = usePalette();
  const preferences = useAppearancePreferences();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.2;
  return (
    <ScreenScrollView surface="groupedBackground">
      <View style={{ gap: SPACING.md }}>
        <SectionHeader title="Erscheinungsbild" />
        <AppearanceModeControl value={preferences.mode} onChange={preferences.setMode} />
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}
        >
          {preferences.mode === "system"
            ? "Passt sich automatisch deinem Gerät an."
            : preferences.mode === "dark"
              ? "Dunkle Flächen mit sanften Kontrasten."
              : "Helle Flächen mit sanften Kontrasten."}
        </Text>
      </View>
      <View style={{ gap: SPACING.md }}>
        <SectionHeader title="Farbthema" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.md }}>
          {THEME_OPTIONS.map((theme) => {
            const preview = resolvePalette(theme.id, palette.dark);
            const selected = preferences.themeId === theme.id;
            return (
              <Pressable
                key={theme.id}
                accessibilityRole="button"
                accessibilityLabel={theme.name}
                accessibilityState={{ selected }}
                onPress={() => {
                  selectionFeedback();
                  if (!selected) preferences.setTheme(theme.id);
                }}
                style={({ pressed }) => ({
                  width: stacked || theme.id === "standard" ? "100%" : "48%",
                  flexDirection: theme.id === "standard" && !stacked ? "row" : "column",
                  flexGrow: 1,
                  minHeight: CONTROL_HEIGHT.large,
                  padding: SPACING.md,
                  gap: SPACING.md,
                  borderRadius: RADII.card,
                  borderWidth: 1,
                  borderColor: selected ? palette.primary : palette.separator,
                  borderCurve: "continuous",
                  backgroundColor: palette.surface,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: theme.id === "standard" && !stacked ? 96 : undefined,
                    backgroundColor: preview.background,
                    borderRadius: RADII.control,
                    padding: SPACING.sm,
                    gap: SPACING.sm,
                    borderWidth: 1,
                    borderColor: preview.separator,
                  }}
                >
                  <View style={{ flexDirection: "row", gap: SPACING.xxs, alignItems: "center" }}>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: RADII.pill,
                        backgroundColor: preview.primary,
                      }}
                    />
                    <View
                      style={{
                        width: "42%",
                        height: 4,
                        borderRadius: RADII.pill,
                        backgroundColor: preview.separator,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      backgroundColor: preview.surface,
                      borderRadius: RADII.small,
                      padding: SPACING.sm,
                      gap: SPACING.xs,
                    }}
                  >
                    <View
                      style={{
                        width: "58%",
                        height: 5,
                        borderRadius: RADII.pill,
                        backgroundColor: preview.textMuted,
                      }}
                    />
                    <View style={{ flexDirection: "row", gap: SPACING.xxs }}>
                      {[preview.primarySoft, preview.secondarySoft, preview.tertiarySoft].map(
                        (color, index) => (
                          <View
                            key={index}
                            style={{
                              height: 20,
                              flex: 1,
                              borderRadius: RADII.small,
                              backgroundColor: color,
                            }}
                          />
                        ),
                      )}
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: SPACING.xs }}>
                    {themeSwatches(theme.id, palette.dark).map((color, index) => (
                      <View
                        key={index}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: RADII.pill,
                          backgroundColor: color,
                        }}
                      />
                    ))}
                  </View>
                </View>
                <View
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.xs }}
                >
                  <View style={{ flex: 1, gap: SPACING.xs }}>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{ ...TYPOGRAPHY.bodyStrong, color: palette.text }}
                    >
                      {theme.name}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}
                    >
                      {theme.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={palette.primary}
                        accessible={false}
                      />
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}>
        Deine Schichtfarben bleiben unverändert.
      </Text>
      {preferences.error ? (
        <View style={{ gap: SPACING.sm }}>
          <InlineNotice message={preferences.error} />
          <Pressable
            accessibilityRole="button"
            onPress={preferences.retry}
            style={{ minHeight: CONTROL_HEIGHT.regular, justifyContent: "center" }}
          >
            <Text style={{ ...TYPOGRAPHY.bodyStrong, color: palette.primary }}>
              Erneut versuchen
            </Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          selectionFeedback();
          preferences.reset();
        }}
        style={({ pressed }) => ({
          minHeight: CONTROL_HEIGHT.regular,
          justifyContent: "center",
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text style={{ ...TYPOGRAPHY.bodyStrong, color: palette.primary }}>
          Standard wiederherstellen
        </Text>
      </Pressable>
      <Text
        accessibilityLiveRegion="polite"
        style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}
      >
        {preferences.saving
          ? "Wird gespeichert …"
          : preferences.error
            ? "Die bisherige Auswahl bleibt erhalten."
            : "Auswahl gespeichert."}
      </Text>
    </ScreenScrollView>
  );
}
