import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";
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
          style={({ pressed }) => ({
            minHeight: 54,
            flexDirection: "row",
            alignItems: "center",
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <View style={{ flex: 1 }}>
            <ReportCardTitle title="Arbeitszeit" />
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={palette.textMuted}
            style={{ marginRight: SPACING.lg }}
          />
        </Pressable>
      ) : (
        <ReportCardTitle title="Arbeitszeit" />
      )}
      <CardSeparator inset={0} />
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
              borderLeftColor: palette.separator,
              borderTopWidth: stacked && index > 0 ? 1 : 0,
              borderTopColor: palette.separator,
              paddingHorizontal: SPACING.md,
              paddingVertical: stacked ? SPACING.sm : 0,
            }}
          >
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
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
            color: palette.textMuted,
            ...TYPOGRAPHY.caption,
          }}
        >
          {caption}
        </Text>
      ) : null}
    </SurfaceCard>
  );
}
