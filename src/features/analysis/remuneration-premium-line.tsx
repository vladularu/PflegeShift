import { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { TimeRemunerationPosition } from "@/domain/remuneration-result";
import { formatMinutes } from "@/engine/working-time";
import { RemunerationDetailSheet } from "@/features/salary/remuneration-detail-sheet";
import { remunerationEuro } from "@/features/salary/remuneration-presentation";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

export function RemunerationPremiumLine({
  position,
}: {
  readonly position: TimeRemunerationPosition;
}) {
  const palette = usePalette();
  const stacked = useWindowDimensions().fontScale >= 1.6;
  const [sources, setSources] = useState(false);
  const basis = position.basis;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={"Zuschlagsdetails: " + position.label}
        accessibilityHint="Gedrückt halten, um die Quellen zu öffnen."
        onLongPress={() => setSources(true)}
        accessibilityActions={[{ name: "activate", label: "Quellen öffnen" }]}
        onAccessibilityAction={() => setSources(true)}
        style={{ minHeight: 44, gap: SPACING.sm, flexDirection: stacked ? "column" : "row" }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: SPACING.xxs }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.text, ...TYPOGRAPHY.label }}
          >
            {position.label}
          </Text>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
          >
            {basis.minutes !== null
              ? "Berücksichtigte Zeit: " + formatMinutes(basis.minutes) + " h"
              : "Berücksichtigte Zeit nicht verfügbar"}
            {"\n"}
            {basis.percentageBasisPoints !== null
              ? new Intl.NumberFormat("de-DE").format(basis.percentageBasisPoints / 100) + " %"
              : "Zuschlag nicht verfügbar"}
            {" · Stundenbasis "}
            {remunerationEuro(basis.hourlyRateCents)}/h
          </Text>
          {position.issue ? (
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
            >
              {position.issue.message}
            </Text>
          ) : null}
        </View>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {remunerationEuro(position.amountCents)}
        </Text>
      </Pressable>
      <RemunerationDetailSheet
        title={position.label}
        positions={sources ? [position] : null}
        onClose={() => setSources(false)}
      />
    </>
  );
}
