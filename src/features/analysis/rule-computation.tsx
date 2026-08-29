import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { recordDiagnostic } from "@/infrastructure/diagnostics";
import { RuleResolutionError, type RuleResolutionFailure } from "@/rules/rule-resolver";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { SurfaceCard } from "@/ui/design-system";
import { LoadFailureView } from "@/ui/loading-view";

export interface RuleComputationFailure {
  readonly ok: false;
  readonly error: RuleResolutionError;
  readonly failure: RuleResolutionFailure;
}

export type RuleComputationResult<T> =
  { readonly ok: true; readonly value: T } | RuleComputationFailure;

export function captureRuleComputation<T>(compute: () => T): RuleComputationResult<T> {
  try {
    return { ok: true, value: compute() };
  } catch (error) {
    if (!(error instanceof RuleResolutionError)) throw error;
    return { ok: false, error, failure: error.failure };
  }
}

function ruleFailureMessage(failure: RuleResolutionFailure): string {
  if (failure.code === "INVALID_EFFECTIVE_DATE") {
    return "Der gewählte Zeitraum ist ungültig. Die Berechnung wurde nicht durchgeführt.";
  }
  if (failure.code === "RULE_PACKAGE_AMBIGUOUS") {
    return "Für diesen Zeitraum sind mehrere Regelstände aktiv. Die Berechnung wurde nicht durchgeführt.";
  }
  if (failure.kind === "HOLIDAY") {
    return "Für diesen Zeitraum fehlen gültige Feiertagsregeln. Die Berechnung wurde nicht durchgeführt.";
  }
  if (failure.kind === "TARIFF") {
    return "Für diesen Zeitraum fehlen gültige Tarifregeln. Die Berechnung wurde nicht durchgeführt.";
  }
  return "Für diesen Zeitraum fehlen gültige Arbeitszeitregeln. Die Berechnung wurde nicht durchgeführt.";
}

export function RuleComputationFailureView({
  failure,
  onRetry,
  title = "Auswertung nicht verfügbar",
}: {
  readonly failure: Pick<RuleComputationFailure, "error" | "failure">;
  readonly onRetry: () => void;
  readonly title?: string;
}) {
  const { code } = failure.failure;
  useEffect(() => {
    recordDiagnostic("reporting", code, failure.error);
  }, [code, failure.error]);

  return (
    <LoadFailureView
      diagnosticCode={code}
      message={ruleFailureMessage(failure.failure)}
      onRetry={onRetry}
      title={title}
    />
  );
}

export function RuleComputationNotice({
  failure,
  onRetry,
  title,
}: {
  readonly failure: Pick<RuleComputationFailure, "error" | "failure">;
  readonly onRetry?: () => void;
  readonly title: string;
}) {
  const palette = usePalette();
  const { code } = failure.failure;
  useEffect(() => {
    recordDiagnostic("reporting", code, failure.error);
  }, [code, failure.error]);

  return (
    <View accessibilityRole="alert" accessible>
      <SurfaceCard style={{ gap: SPACING.sm, padding: SPACING.lg }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
        >
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
        >
          {ruleFailureMessage(failure.failure)}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          Diagnosecode: {code}
        </Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => ({
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: RADII.control,
              backgroundColor: palette.primarySoft,
              opacity: pressed ? 0.72 : 1,
              paddingHorizontal: SPACING.lg,
            })}
          >
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{ color: palette.primary, ...TYPOGRAPHY.bodyStrong }}
            >
              Erneut prüfen
            </Text>
          </Pressable>
        ) : null}
      </SurfaceCard>
    </View>
  );
}
