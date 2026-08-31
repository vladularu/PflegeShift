import { Text } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { SurfaceCard } from "@/ui/design-system";

export function AnalysisCoverageNote({ message }: { readonly message: string }) {
  const palette = usePalette();
  return (
    <SurfaceCard style={{ padding: SPACING.md }}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
      >
        {message}
      </Text>
    </SurfaceCard>
  );
}
