import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { usePalette } from "@/theme/palette";
import { CARD_HEADER_INSET, RADII, SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { CardFooterLine, SurfaceCard } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";

export function AnalysisListCard({
  title,
  label,
  onPress,
  children,
  caption,
}: PropsWithChildren<{
  readonly title: string;
  readonly label?: string;
  readonly onPress?: () => void;
  readonly caption?: string;
}>) {
  const p = usePalette();
  const secondaryText = p.dark ? p.text : p.textMuted;
  const heading = (
    <>
      <Text
        accessibilityRole="header"
        style={{
          flex: 1,
          textAlign: "left",
          color: p.text,
          ...TYPOGRAPHY.sectionTitle,
        }}
      >
        {title}
      </Text>
      {onPress ? (
        <Ionicons name="ellipsis-horizontal-circle" size={22} color={secondaryText} />
      ) : null}
    </>
  );
  const headerStyle = {
    minHeight: p.dark ? 56 : 50,
    paddingHorizontal: p.dark ? SPACING.lg : SPACING.lg - CARD_HEADER_INSET,
    paddingVertical: p.dark ? SPACING.sm : SPACING.xs,
    marginHorizontal: p.dark ? 0 : CARD_HEADER_INSET,
    marginTop: p.dark ? 0 : CARD_HEADER_INSET,
    borderTopLeftRadius: p.dark ? 0 : RADII.card - CARD_HEADER_INSET,
    borderTopRightRadius: p.dark ? 0 : RADII.card - CARD_HEADER_INSET,
    gap: SPACING.sm,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderBottomWidth: 1,
    borderBottomColor: p.cardSeparator,
    backgroundColor: p.cardHeader,
  };
  return (
    <SurfaceCard>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label ?? title + ": Details öffnen"}
          onPress={() => {
            selectionFeedback();
            onPress();
          }}
          style={({ pressed }) => ({ ...headerStyle, opacity: pressed ? 0.65 : 1 })}
        >
          {heading}
        </Pressable>
      ) : (
        <View style={headerStyle}>{heading}</View>
      )}
      <View style={{ paddingHorizontal: SPACING.lg }}>{children}</View>
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
export function AnalysisValueRow({
  label,
  value,
  total = false,
  first = false,
  onPress,
  icon,
  iconColor,
  leading,
  dot,
  reserveDisclosure = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly total?: boolean;
  readonly first?: boolean;
  readonly onPress?: () => void;
  readonly icon?: ComponentProps<typeof Ionicons>["name"];
  readonly iconColor?: string;
  readonly leading?: ReactNode;
  readonly dot?: string;
  readonly reserveDisclosure?: boolean;
}) {
  const p = usePalette();
  const secondaryText = p.dark ? p.text : p.textMuted;
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3;
  const style = {
    minHeight: 52,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    borderTopWidth: first ? 0 : 1,
    borderTopColor: p.cardSeparator,
    flexDirection: stacked ? ("column" as const) : ("row" as const),
    alignItems: stacked ? ("stretch" as const) : ("center" as const),
  };
  const content = (
    <>
      <View
        style={{
          flex: stacked ? undefined : 1,
          minWidth: 0,
          flexDirection: "row",
          gap: SPACING.sm,
          alignItems: "center",
        }}
      >
        {leading}
        {icon ? <Ionicons name={icon} color={iconColor ?? secondaryText} size={18} /> : null}
        {dot ? (
          <View style={{ width: 8, height: 8, borderRadius: RADII.pill, backgroundColor: dot }} />
        ) : null}
        <Text
          style={{
            flex: 1,
            color: secondaryText,
            ...TYPOGRAPHY.body,
          }}
        >
          {label}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.xs,
          maxWidth: stacked ? "100%" : "58%",
          alignSelf: stacked ? "flex-end" : undefined,
        }}
      >
        <Text
          style={{
            flexShrink: 1,
            textAlign: "right",
            color: p.text,
            ...(total ? TYPOGRAPHY.bodyStrong : TYPOGRAPHY.body),
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
        </Text>
        {onPress || reserveDisclosure ? (
          <View
            testID="analysis-disclosure-gutter"
            style={{ width: 16 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {onPress ? (
              <Ionicons name="ellipsis-horizontal-circle" size={16} color={secondaryText} />
            ) : null}
          </View>
        ) : null}
      </View>
    </>
  );
  const accessibilityLabel = label + ": " + value;
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        selectionFeedback();
        onPress();
      }}
      style={({ pressed }) => ({ ...style, opacity: pressed ? 0.65 : 1 })}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={accessibilityLabel} style={style}>
      {content}
    </View>
  );
}
