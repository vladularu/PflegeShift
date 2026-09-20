import { Text, View, useWindowDimensions } from "react-native";

import { SHIFT_TYPE_LABELS } from "@/domain/types";
import { formatMinutes } from "@/engine/working-time";
import type { MonthlyShiftTypeAnalysis } from "@/features/analysis/analysis-metrics";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { DEFAULT_SHIFT_SYMBOLS } from "@/theme/shift-symbols";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { CardSeparator, ColorBadge, SurfaceCard } from "@/ui/design-system";
import { ReportCardTitle } from "./report-card-title";

export { ReportCardTitle } from "./report-card-title";

export function ShiftTypeCountCard({ analysis }: { readonly analysis: MonthlyShiftTypeAnalysis }) {
  return <ShiftTypeReportCard analysis={analysis} mode="COUNT" title="Schichten zählen" />;
}

export function ShiftTypeHoursCard({ analysis }: { readonly analysis: MonthlyShiftTypeAnalysis }) {
  return <ShiftTypeReportCard analysis={analysis} mode="HOURS" title="Stunden pro Schicht" />;
}

function ShiftTypeReportCard({
  analysis,
  mode,
  title,
}: {
  readonly analysis: MonthlyShiftTypeAnalysis;
  readonly mode: "COUNT" | "HOURS";
  readonly title: string;
}) {
  const palette = usePalette();
  const items = analysis.items.filter((item) => mode === "COUNT" || item.minutes > 0);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3;
  const totalValue =
    mode === "COUNT" ? String(analysis.totalCount) : `${formatMinutes(analysis.totalMinutes)} h`;
  return (
    <SurfaceCard accessibilityLabel={`${title}, Gesamt ${totalValue}`}>
      <ReportCardTitle title={title} />
      <CardSeparator inset={0} />
      <View style={{ paddingHorizontal: SPACING.lg }}>
        {items.map((item, index) => (
          <View key={item.type}>
            {index > 0 ? <CardSeparator inset={40} /> : null}
            <View
              accessibilityLabel={`${SHIFT_TYPE_LABELS[item.type]}: ${
                mode === "COUNT" ? item.count : `${formatMinutes(item.minutes)} Stunden`
              }`}
              accessible
              style={{
                minHeight: 56,
                flexDirection: "row",
                flexWrap: stacked ? "wrap" : "nowrap",
                alignItems: "center",
                gap: SPACING.md,
                rowGap: SPACING.xs,
                paddingVertical: SPACING.sm,
              }}
            >
              <ColorBadge
                color={SHIFT_TYPE_COLORS[item.type]}
                label={DEFAULT_SHIFT_SYMBOLS[item.type]}
                size={28}
              />
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{
                  minWidth: 0,
                  flex: 1,
                  color: palette.text,
                  ...TYPOGRAPHY.body,
                }}
              >
                {SHIFT_TYPE_LABELS[item.type]}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{
                  width: stacked ? "100%" : undefined,
                  color: palette.text,
                  ...TYPOGRAPHY.bodyStrong,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {mode === "COUNT" ? item.count : `${formatMinutes(item.minutes)} h`}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <CardSeparator inset={0} />
      <View
        accessibilityLabel={`Gesamt: ${totalValue}`}
        accessible
        style={{
          minHeight: 56,
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "stretch" : "center",
          justifyContent: "space-between",
          gap: SPACING.md,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm,
        }}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          Gesamt
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong, fontVariant: ["tabular-nums"] }}
        >
          {totalValue}
        </Text>
      </View>
    </SurfaceCard>
  );
}

export function WorktimeCard({
  target,
  actual,
  balance,
  balanceAccent,
}: {
  readonly target: string;
  readonly actual: string;
  readonly balance: string;
  readonly balanceAccent: string;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3;
  const values = [
    { label: "Soll", value: target, accent: palette.text },
    { label: "Ist", value: actual, accent: palette.text },
    { label: "Saldo", value: balance, accent: balanceAccent },
  ];
  return (
    <SurfaceCard>
      <ReportCardTitle title="Arbeitszeit" />
      <CardSeparator inset={0} />
      <View style={{ flexDirection: stacked ? "column" : "row", paddingVertical: SPACING.md }}>
        {values.map((item, index) => (
          <View
            key={item.label}
            accessibilityLabel={`${item.label}: ${item.value}`}
            accessible
            style={{
              minWidth: 0,
              flex: stacked ? undefined : 1,
              gap: SPACING.xs,
              borderLeftWidth: !stacked && index > 0 ? 1 : 0,
              borderLeftColor: palette.separator,
              borderTopWidth: stacked && index > 0 ? 1 : 0,
              borderTopColor: palette.separator,
              paddingHorizontal: SPACING.md,
              paddingVertical: stacked ? SPACING.sm : 0,
            }}
          >
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
            >
              {item.label}
            </Text>
            <Text
              selectable
              style={{
                color: item.accent,
                ...TYPOGRAPHY.metricValue,
                fontVariant: ["tabular-nums"],
              }}
            >
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </SurfaceCard>
  );
}
