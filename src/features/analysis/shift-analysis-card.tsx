import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ShiftMetric } from "@/domain/analysis-view";
import { SHIFT_TYPE_LABELS } from "@/domain/types";
import { formatMinutes } from "@/engine/working-time";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { SPACING, RADII } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { ColorBadge } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";
import type { MonthlyShiftTypeAnalysis } from "./analysis-metrics";
import { AnalysisListCard, AnalysisValueRow } from "./analysis-list-card";
import { useAnalysisView } from "./analysis-view-preferences";

export function ShiftAnalysisCard({
  analysis,
  onPress,
  caption,
}: {
  readonly analysis: MonthlyShiftTypeAnalysis;
  readonly onPress?: () => void;
  readonly caption?: string;
}) {
  const p = usePalette();
  const view = useAnalysisView();
  const [localMetric, setLocalMetric] = useState<ShiftMetric>("HOURS");
  const metric = view.ready ? view.preferences.shiftMetric : localMetric;
  const items = analysis.items.filter((item) => metric === "COUNT" || item.minutes > 0);
  return (
    <AnalysisListCard title="Schichten" onPress={onPress} caption={caption}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignSelf: "flex-end",
          paddingTop: SPACING.sm,
          gap: SPACING.xxs,
        }}
      >
        {(["COUNT", "HOURS"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={value === "COUNT" ? "Schichten: Anzahl" : "Schichten: Stunden"}
            accessibilityState={{ selected: metric === value }}
            onPress={() => {
              selectionFeedback();
              setLocalMetric(value);
              view.update((current) => ({ ...current, shiftMetric: value }));
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: "center",
              borderRadius: RADII.control,
              paddingHorizontal: SPACING.md,
              backgroundColor: metric === value ? p.surfaceMuted : "transparent",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Text style={{ color: metric === value ? p.text : p.textMuted, ...TYPOGRAPHY.caption }}>
              {value === "COUNT" ? "Anzahl" : "Stunden"}
            </Text>
          </Pressable>
        ))}
      </View>
      {items.length ? (
        items.map((item, index) => (
          <AnalysisValueRow
            first={index === 0}
            key={item.type}
            label={
              analysis.appearances?.[item.type]?.length === 1
                ? analysis.appearances[item.type]![0].title
                : SHIFT_TYPE_LABELS[item.type]
            }
            value={metric === "COUNT" ? String(item.count) : formatMinutes(item.minutes) + " h"}
            leading={
              analysis.appearances?.[item.type]?.length ? (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xxs, maxWidth: 64 }}
                >
                  {analysis.appearances[item.type]!.map((style) => (
                    <ColorBadge
                      key={JSON.stringify(style)}
                      color={style.color}
                      label={style.symbol}
                      size={26}
                    />
                  ))}
                </View>
              ) : undefined
            }
            dot={
              analysis.appearances?.[item.type]?.length ? undefined : SHIFT_TYPE_COLORS[item.type]
            }
          />
        ))
      ) : (
        <Text style={{ paddingVertical: SPACING.lg, color: p.textMuted, ...TYPOGRAPHY.body }}>
          {analysis.totalCount === 0
            ? "Noch keine Dienste erfasst."
            : "Keine anrechenbaren Stunden für diese Schichten."}
        </Text>
      )}
      {items.length ? (
        <AnalysisValueRow
          total
          label="Gesamt"
          value={
            metric === "COUNT"
              ? String(analysis.totalCount)
              : formatMinutes(analysis.totalMinutes) + " h"
          }
        />
      ) : null}
    </AnalysisListCard>
  );
}
