import type { PropsWithChildren } from "react";
import { ScrollView, Text, View } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";

export function ReportScrollView({ children }: PropsWithChildren) {
  const palette = usePalette();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{
        gap: SPACING.lg,
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.md,
        paddingBottom: 48,
      }}
    >
      {children}
    </ScrollView>
  );
}

export function ReportTestBadge() {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel="Testdaten"
      style={{
        alignSelf: "center",
        borderRadius: RADII.pill,
        backgroundColor: palette.primarySoft,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 5,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.primary, ...TYPOGRAPHY.overline }}
      >
        TESTDATEN
      </Text>
    </View>
  );
}

export function ReportFootnote({ children }: PropsWithChildren) {
  const palette = usePalette();
  return (
    <Text
      maxFontSizeMultiplier={TEXT_MAX_SCALE}
      selectable
      style={{
        color: palette.textMuted,
        paddingHorizontal: SPACING.xs,
        textAlign: "center",
        ...TYPOGRAPHY.footnote,
      }}
    >
      {children}
    </Text>
  );
}

export function ReportPeriodContent({ children }: PropsWithChildren) {
  return <View style={{ gap: SPACING.lg }}>{children}</View>;
}
