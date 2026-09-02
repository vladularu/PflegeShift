import { Text, View } from "react-native";

import type { MonthlyPayEstimate } from "@/domain/types";
import type { RuleResolutionFailure } from "@/rules/rule-resolver";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";

export function formatEuro(value: number | null): string {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function salarySummaryPresentation(
  pay: MonthlyPayEstimate | null,
  salaryReady: boolean,
  ruleFailure: RuleResolutionFailure | null | undefined,
): { readonly value: string; readonly visibleSummary: string | undefined } {
  if (!salaryReady) return { value: "Einrichten", visibleSummary: "Gehaltsgrundlage fehlt" };
  if (pay === null) {
    return {
      value: "Nicht verfügbar",
      visibleSummary:
        ruleFailure?.kind === "HOLIDAY"
          ? "Feiertagsregeln für die Zuschläge fehlen"
          : "Für diesen Zeitraum liegt kein geprüfter Tarifstand vor",
    };
  }
  if (!pay.available) {
    return {
      value: "Nicht verfügbar",
      visibleSummary: "Für diesen Monat liegt kein unterstützter Tarifstand vor",
    };
  }
  return { value: formatEuro(pay.estimatedGrossAmount), visibleSummary: undefined };
}

export function SalaryRuleUnavailableContent({
  ruleFailure,
}: {
  readonly ruleFailure: RuleResolutionFailure | null | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={{ padding: SPACING.lg }}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
      >
        {ruleFailure?.kind === "HOLIDAY"
          ? "Die Arbeitszeit bleibt sichtbar. Nur feiertagsabhängige Zuschläge können für diesen Monat nicht sicher berechnet werden."
          : "Die Arbeitszeit bleibt sichtbar. Für die Gehaltsberechnung fehlt ein geprüfter Tarifstand."}
      </Text>
    </View>
  );
}
