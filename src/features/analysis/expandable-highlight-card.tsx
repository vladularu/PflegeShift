import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { AnalysisCardDetails } from "@/features/analysis/analysis-card-details";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";

export function ExpandableHighlightCard({
  title,
  value,
  countBadge,
  summary,
  icon,
  accent,
  expanded,
  onToggle,
  children,
}: {
  readonly title: string;
  readonly value: string;
  readonly countBadge?: number;
  readonly summary?: string;
  readonly icon: ComponentProps<typeof Ionicons>["name"];
  readonly accent: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const accessibleValue = countBadge === undefined ? value : `${countBadge} ${value}`;
  return (
    <View>
      <SurfaceCard
        style={{
          borderColor: `${accent}52`,
          backgroundColor: `${accent}10`,
        }}
      >
        <Pressable
          accessibilityHint={expanded ? "Blendet die Details aus" : "Blendet die Details ein"}
          accessibilityLabel={[title, accessibleValue, summary].filter(Boolean).join(", ")}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onToggle}
          style={({ pressed }) => ({
            minHeight: 100,
            gap: SPACING.sm,
            backgroundColor: pressed ? `${accent}18` : "transparent",
            opacity: pressed ? 0.78 : 1,
            paddingHorizontal: SPACING.xl,
            paddingVertical: SPACING.md,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
            <View
              accessibilityElementsHidden
              style={{
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: RADII.control,
                backgroundColor: `${accent}1F`,
              }}
            >
              <Ionicons color={accent} name={icon} size={15} />
            </View>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ minWidth: 0, flex: 1, color: accent, ...TYPOGRAPHY.highlightTitle }}
            >
              {title}
            </Text>
            <Ionicons
              accessibilityElementsHidden
              color={palette.textMuted}
              name={expanded ? "chevron-up" : "chevron-down"}
              size={19}
            />
          </View>
          <View style={{ gap: SPACING.xxs }}>
            {countBadge === undefined ? (
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{
                  color: palette.text,
                  ...TYPOGRAPHY.highlightValue,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {value}
              </Text>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: `${accent}52`,
                    borderRadius: RADII.pill,
                    backgroundColor: `${accent}1F`,
                  }}
                >
                  <Text
                    style={{
                      color: accent,
                      ...TYPOGRAPHY.highlightCount,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {countBadge}
                  </Text>
                </View>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{
                    minWidth: 0,
                    flex: 1,
                    color: palette.text,
                    ...TYPOGRAPHY.highlightCountLabel,
                  }}
                >
                  {value}
                </Text>
              </View>
            )}
            {summary ? (
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.textMuted, ...TYPOGRAPHY.highlightSummary }}
              >
                {summary}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <AnalysisCardDetails expanded={expanded}>
          <CardSeparator inset={0} />
          {children}
        </AnalysisCardDetails>
      </SurfaceCard>
    </View>
  );
}
