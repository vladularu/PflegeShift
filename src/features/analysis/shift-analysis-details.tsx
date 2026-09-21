import { Text, View, useWindowDimensions } from "react-native";
import { SHIFT_TYPE_LABELS } from "@/domain/types";
import { formatMinutes } from "@/engine/working-time";
import type { MonthlyShiftTypeAnalysis } from "./analysis-metrics";
import { AnalysisListCard } from "./analysis-list-card";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { SPACING, RADII } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { EmptyState } from "@/ui/design-system";

export function ShiftAnalysisDetails({
  analysis,
  creditsAvailable = true,
}: {
  readonly analysis: MonthlyShiftTypeAnalysis;
  readonly creditsAvailable?: boolean;
}) {
  const p = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3;
  const rows = [
    ...analysis.items.map((item) => ({
      id: item.type,
      label: SHIFT_TYPE_LABELS[item.type],
      count: item.count,
      hours:
        !creditsAvailable && (item.type === "VACATION" || item.type === "SICK")
          ? "Nicht verfügbar"
          : formatMinutes(item.minutes) + " h",
      color: SHIFT_TYPE_COLORS[item.type],
      total: false,
    })),
    {
      id: "TOTAL",
      label: "Gesamt",
      count: analysis.totalCount,
      hours: formatMinutes(analysis.totalMinutes) + " h",
      color: undefined,
      total: true,
    },
  ];
  return (
    <AnalysisListCard
      title="Schichten"
      caption={
        creditsAvailable
          ? undefined
          : "Stunden ohne Abwesenheitsgutschriften. Urlaub und Krankheit benötigen einen gültigen Feiertagsstand."
      }
    >
      {analysis.totalCount === 0 ? (
        <EmptyState
          title="Noch keine Dienste"
          message="Trage Dienste ein, um den Zeitraum auszuwerten."
        />
      ) : (
        <>
          {!stacked ? (
            <View style={{ flexDirection: "row", gap: SPACING.sm, paddingVertical: SPACING.md }}>
              <Text style={{ flex: 1, color: p.textMuted, ...TYPOGRAPHY.caption }}>Schicht</Text>
              <Text
                style={{ width: 56, textAlign: "right", color: p.textMuted, ...TYPOGRAPHY.caption }}
              >
                Anzahl
              </Text>
              <Text
                style={{
                  width: 108,
                  textAlign: "right",
                  color: p.textMuted,
                  ...TYPOGRAPHY.caption,
                }}
              >
                Stunden
              </Text>
            </View>
          ) : null}
          {rows.map((row, index) => (
            <View
              key={row.id}
              accessible
              accessibilityLabel={`${row.label}, Anzahl ${row.count}, Stunden ${row.hours}`}
              testID={`shift-detail-${row.id}`}
              style={{
                minHeight: 56,
                paddingVertical: SPACING.md,
                gap: SPACING.sm,
                flexDirection: stacked ? "column" : "row",
                alignItems: stacked ? "stretch" : "center",
                borderTopWidth: !stacked || index > 0 ? 1 : 0,
                borderTopColor: p.separator,
              }}
            >
              <View
                style={{
                  flex: stacked ? undefined : 1,
                  minWidth: 0,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.sm,
                }}
              >
                {row.color ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: RADII.pill,
                      backgroundColor: row.color,
                    }}
                  />
                ) : null}
                <Text
                  style={{
                    flex: 1,
                    color: row.total ? p.text : p.textMuted,
                    ...(row.total ? TYPOGRAPHY.bodyStrong : TYPOGRAPHY.body),
                  }}
                >
                  {row.label}
                </Text>
              </View>
              <View style={{ flexDirection: fontScale >= 2 ? "column" : "row", gap: SPACING.sm }}>
                {[
                  { label: "Anzahl", value: String(row.count), width: 56 },
                  { label: "Stunden", value: row.hours, width: 108 },
                ].map((metric) => (
                  <View
                    key={metric.label}
                    style={{
                      width: stacked ? undefined : metric.width,
                      flex: stacked && fontScale < 2 ? 1 : undefined,
                      gap: SPACING.xs,
                    }}
                  >
                    {stacked ? (
                      <Text style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
                        {metric.label}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        color: p.text,
                        textAlign: stacked ? "left" : "right",
                        ...(row.total ? TYPOGRAPHY.bodyStrong : TYPOGRAPHY.body),
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {metric.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </AnalysisListCard>
  );
}
