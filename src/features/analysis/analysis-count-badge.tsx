import { Text, View } from "react-native";
import { RADII, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

export function AnalysisCountBadge({
  count,
  accent,
}: {
  readonly count: number;
  readonly accent: string;
}) {
  return (
    <View
      accessibilityElementsHidden
      style={{
        minWidth: 44,
        minHeight: 44,
        paddingHorizontal: SPACING.xs,
        paddingVertical: SPACING.xxs,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: `${accent}52`,
        borderRadius: RADII.pill,
        backgroundColor: `${accent}1F`,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: accent, ...TYPOGRAPHY.highlightCount, fontVariant: ["tabular-nums"] }}
      >
        {count}
      </Text>
    </View>
  );
}
