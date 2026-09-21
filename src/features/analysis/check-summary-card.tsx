import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { MINIMUM_TOUCH_TARGET, SPACING } from "@/theme/tokens";
import { selectionFeedback } from "@/ui/haptics";

export function CheckClearStatus({ title }: { readonly title: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm }}>
      <Ionicons
        name="checkmark-circle-outline"
        size={19}
        color={palette.success}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={{ flex: 1, minWidth: 0, gap: SPACING.xxs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.text, ...TYPOGRAPHY.label }}
        >
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          Keine Auffälligkeiten
        </Text>
      </View>
    </View>
  );
}

export function CheckExplanation() {
  const palette = usePalette();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ gap: SPACING.xs, paddingHorizontal: SPACING.xxs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Über die Prüfung"
        accessibilityState={{ expanded }}
        onPress={() => {
          selectionFeedback();
          setExpanded((current) => !current);
        }}
        style={({ pressed }) => ({
          minHeight: MINIMUM_TOUCH_TARGET,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.sm,
          paddingVertical: SPACING.sm,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons
          name="information-circle-outline"
          size={17}
          color={palette.textMuted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ flex: 1, color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          Über die Prüfung
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={palette.textMuted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Pressable>
      {expanded ? (
        <Text
          selectable
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          Automatische Prüfung deiner Dienste. Die Hinweise ersetzen keine Rechtsberatung.
          Gesetzliche Prüfung und freiwillige Planung werden getrennt dargestellt.
        </Text>
      ) : null}
    </View>
  );
}

export function CheckPeriod({ period }: { readonly period: string }) {
  const p = usePalette();
  return (
    <Text style={{ color: p.textMuted, textAlign: "center", ...TYPOGRAPHY.caption }}>{period}</Text>
  );
}
