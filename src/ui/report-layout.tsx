import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { ScreenScrollView } from "@/ui/screen-layout";

export function ReportScrollView({ children }: PropsWithChildren) {
  return <ScreenScrollView surface="groupedBackground">{children}</ScreenScrollView>;
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
  return <View style={{ gap: SCREEN_LAYOUT.sectionGap }}>{children}</View>;
}
