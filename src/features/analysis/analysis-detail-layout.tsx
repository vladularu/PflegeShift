import { Text } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { SurfaceCard } from "@/ui/design-system";

export function AnalysisDetailSummaryCard({
  accent,
  caption,
  emphasis = "title",
  period,
  title,
}: {
  readonly accent?: string;
  readonly caption: string;
  readonly emphasis?: "metric" | "title";
  readonly period: string;
  readonly title: string;
}) {
  const palette = usePalette();
  const metric = emphasis === "metric";

  return (
    <SurfaceCard style={{ gap: SPACING.xs, padding: SPACING.xl }} testID="analysis-detail-summary">
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        {period}
      </Text>
      <Text
        accessibilityRole="header"
        dynamicTypeRamp={metric ? "largeTitle" : "title2"}
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{
          color: accent ?? palette.text,
          ...(metric ? TYPOGRAPHY.hero : TYPOGRAPHY.screenTitle),
          ...(metric ? { fontVariant: ["tabular-nums"] as const } : {}),
        }}
      >
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
      >
        {caption}
      </Text>
    </SurfaceCard>
  );
}
