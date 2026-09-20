import { Text, View } from "react-native";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

export function ReportCardTitle({ title }: { readonly title: string }) {
  const palette = usePalette();
  return (
    <View
      style={{
        minHeight: 54,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{
          alignSelf: "stretch",
          color: palette.text,
          textAlign: "center",
          ...TYPOGRAPHY.sectionTitle,
        }}
      >
        {title}
      </Text>
    </View>
  );
}
