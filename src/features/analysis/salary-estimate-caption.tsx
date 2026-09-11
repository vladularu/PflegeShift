import { Text } from "react-native";
import type { MonthlyPayEstimate } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

export function SalaryEstimateCaption({ pay }: { readonly pay: MonthlyPayEstimate }) {
  const palette = usePalette();
  return (
    <Text
      maxFontSizeMultiplier={TEXT_MAX_SCALE}
      selectable
      style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
    >
      {pay.tariffLabel}
      {pay.confirmedAllowance === null && pay.assessment.estimateNote
        ? `\n${pay.assessment.estimateNote}`
        : ""}
    </Text>
  );
}
