import type { PropsWithChildren } from "react";
import { ScrollView, Text, View } from "react-native";

import { usePalette } from "@/theme/palette";

export function ReportScrollView({ children }: PropsWithChildren) {
  const palette = usePalette();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 48 }}
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
        borderRadius: 999,
        backgroundColor: palette.primarySoft,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text selectable style={{ color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }}>
        TESTDATEN
      </Text>
    </View>
  );
}

export function ReportFootnote({ children }: PropsWithChildren) {
  const palette = usePalette();
  return (
    <Text
      selectable
      style={{
        color: palette.textMuted,
        fontSize: 10,
        lineHeight: 15,
        paddingHorizontal: 6,
        textAlign: "center",
      }}
    >
      {children}
    </Text>
  );
}

export function ReportPeriodContent({ children }: PropsWithChildren) {
  return (
    <View style={{ gap: 14 }}>
      {children}
    </View>
  );
}
