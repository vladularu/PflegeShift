import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { CardFooterLine, CardHeader, SurfaceCard } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";
import { ReportCardTitle } from "./report-card-title";

export function WorktimeCard({
  target,
  actual,
  balance,
  balanceAccent,
  onPress,
  caption,
}: {
  readonly target: string;
  readonly actual: string;
  readonly balance: string;
  readonly balanceAccent: string;
  readonly onPress?: () => void;
  readonly caption?: string;
}) {
  const palette = usePalette();
  const secondaryText = palette.dark ? palette.text : palette.textMuted;
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3;
  const withUnit = (value: string) => (/[0-9]/u.test(value) ? value + " h" : value);
  const values = [
    { label: "Soll", value: target, accent: palette.text },
    { label: "Ist", value: actual, accent: palette.text },
    { label: "Saldo", value: balance, accent: balanceAccent },
  ];
  return (
    <SurfaceCard>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stunden, Ist ${withUnit(actual)}, Soll ${withUnit(target)}, Saldo ${withUnit(balance)}`}
          onPress={() => {
            selectionFeedback();
            onPress();
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
        >
          <CardHeader
            title="Arbeitszeit"
            action={<Ionicons name="ellipsis-horizontal-circle" size={20} color={secondaryText} />}
          />
        </Pressable>
      ) : (
        <ReportCardTitle title="Arbeitszeit" />
      )}
      <View
        testID="worktime-values"
        style={{ flexDirection: stacked ? "column" : "row", paddingVertical: SPACING.md }}
      >
        {values.map((item, index) => (
          <View
            key={item.label}
            accessibilityLabel={`${item.label === "Saldo" ? "Stundensaldo" : item.label}: ${withUnit(item.value)}`}
            accessible
            style={{
              minWidth: 0,
              flex: stacked ? undefined : 1,
              gap: SPACING.xs,
              borderLeftWidth: !stacked && index > 0 ? 1 : 0,
              borderLeftColor: palette.cardSeparator,
              borderTopWidth: stacked && index > 0 ? 1 : 0,
              borderTopColor: palette.cardSeparator,
              paddingHorizontal: SPACING.md,
              paddingVertical: stacked ? SPACING.sm : 0,
            }}
          >
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: secondaryText, ...TYPOGRAPHY.caption }}
            >
              {item.label}
            </Text>
            <Text
              selectable
              style={{
                color: item.accent,
                ...TYPOGRAPHY.metricValue,
                fontVariant: ["tabular-nums"],
              }}
            >
              {item.value}
            </Text>
          </View>
        ))}
      </View>
      {caption ? (
        <Text
          style={{
            paddingHorizontal: SPACING.lg,
            paddingBottom: SPACING.md,
            color: secondaryText,
            ...TYPOGRAPHY.caption,
          }}
        >
          {caption}
        </Text>
      ) : null}
      <CardFooterLine />
    </SurfaceCard>
  );
}
