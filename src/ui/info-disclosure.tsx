import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { usePalette } from "@/theme/palette";
import { MINIMUM_TOUCH_TARGET, SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { selectionFeedback } from "./haptics";

export function InfoDisclosure({
  summary,
  details,
  label,
}: {
  readonly summary: string;
  readonly details: string | readonly string[];
  readonly label?: string;
}) {
  const p = usePalette();
  const [expanded, setExpanded] = useState(false);
  const lines = typeof details === "string" ? [details] : details;
  if (!lines.some((line) => line !== summary)) {
    return (
      <Text selectable style={{ color: p.textSecondary, ...TYPOGRAPHY.body }}>
        {summary}
      </Text>
    );
  }
  return (
    <View style={{ gap: SPACING.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}. ${summary}` : summary}
        accessibilityHint="Klappt die Erklärung auf oder zu"
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
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ flex: 1, minWidth: 0, color: p.textSecondary, ...TYPOGRAPHY.body }}>
          {summary}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "information-circle-outline"}
          color={p.primary}
          size={20}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Pressable>
      {expanded
        ? lines.map((line, index) => (
            <Text key={index} selectable style={{ color: p.textSecondary, ...TYPOGRAPHY.body }}>
              {line}
            </Text>
          ))
        : null}
    </View>
  );
}
