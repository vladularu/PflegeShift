import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { MonthlyPayEstimate, ShiftEntry } from "@/domain/types";
import { formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { formatMinutes } from "@/engine/working-time";
import { usePalette } from "@/theme/palette";
import { MINIMUM_TOUCH_TARGET, RADII, SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CardSeparator, EmptyState, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";
import { AnalysisDetailSummaryCard } from "./analysis-detail-layout";
import { buildPremiumBreakdown, premiumAmount } from "./premium-breakdown";
import { formatEuro } from "./salary-summary-card";

export function PremiumBreakdownList({
  pay,
  shifts,
}: {
  readonly pay: MonthlyPayEstimate;
  readonly shifts: readonly ShiftEntry[];
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const data = buildPremiumBreakdown(pay.shiftBreakdowns, shifts, filter);
  const stacked = fontScale >= SCREEN_LAYOUT.headerAccessoryStackFontScale;
  const selectedLabel = data.categories.find((item) => item.key === data.activeFilter)?.label;
  return (
    <>
      <AnalysisDetailSummaryCard
        emphasis="metric"
        title={formatEuro(pay.timePremiumAmount)}
        period={formatMonthTitle(pay.month)}
        caption="Zeitzuschläge im gesamten Monat"
      />
      {data.categories.length === 0 ? (
        <SurfaceCard>
          <EmptyState
            title="Keine Zeitzuschläge"
            message="In diesem Monat wurden keine Zeitzuschläge berechnet."
          />
        </SurfaceCard>
      ) : (
        <>
          <SectionHeader
            title="Nach Zuschlagsart"
            caption="Wähle eine Art für die zugehörigen Dienste."
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
            {[{ key: null, label: "Alle", amount: pay.timePremiumAmount }, ...data.categories].map(
              (item) => {
                const selected = item.key === data.activeFilter;
                return (
                  <Pressable
                    key={item.key ?? "all"}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.label}, ${formatEuro(item.amount)}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setFilter(item.key);
                      setExpanded(null);
                      selectionFeedback();
                    }}
                    style={({ pressed }) => ({
                      minHeight: MINIMUM_TOUCH_TARGET,
                      padding: SPACING.md,
                      gap: SPACING.xxs,
                      borderRadius: RADII.control,
                      borderWidth: 1,
                      borderColor: selected ? palette.primary : palette.border,
                      backgroundColor: selected ? palette.primarySoft : palette.surface,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{ color: palette.text, ...TYPOGRAPHY.label }}
                    >
                      {selected ? "✓ " : ""}
                      {item.label}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                    >
                      {formatEuro(item.amount)}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
          <SectionHeader
            title="Dienste"
            caption={
              data.activeFilter === null
                ? `${data.rows.length} Dienste · chronologisch`
                : `Gefiltert: ${selectedLabel} · ${formatEuro(data.amount)} · ${data.rows.length} Dienste`
            }
          />
          {data.rows.map((item) => {
            const isExpanded = expanded === item.shiftId;
            const title = item.shift?.title ?? "Dienst";
            return (
              <SurfaceCard key={item.shiftId}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDateTitle(item.date)}, ${title}, ${formatEuro(premiumAmount(item.premiumLines))}`}
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() => {
                    setExpanded(isExpanded ? null : item.shiftId);
                    selectionFeedback();
                  }}
                  style={({ pressed }) => ({
                    minHeight: MINIMUM_TOUCH_TARGET,
                    padding: SPACING.lg,
                    gap: SPACING.sm,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{ flex: 1, color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                    >
                      {formatDateTitle(item.date)}
                    </Text>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      color={palette.textMuted}
                      size={18}
                      accessibilityElementsHidden
                    />
                  </View>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                  >
                    {title}
                    {item.shift?.startTime
                      ? ` · ${item.shift.startTime}–${item.shift.endTime}`
                      : ""}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                  >
                    {formatEuro(premiumAmount(item.premiumLines))}
                    {data.activeFilter !== null ? ` · ${selectedLabel}` : ""}
                  </Text>
                </Pressable>
                {isExpanded ? (
                  <View style={{ padding: SPACING.lg, paddingTop: 0, gap: SPACING.md }}>
                    <CardSeparator inset={0} />
                    {item.premiumLines.map((line, index) => (
                      <View
                        key={`${line.key}-${index}`}
                        style={{ gap: SPACING.sm, flexDirection: stacked ? "column" : "row" }}
                      >
                        <View style={{ flex: 1, minWidth: 0, gap: SPACING.xxs }}>
                          <Text
                            maxFontSizeMultiplier={TEXT_MAX_SCALE}
                            style={{ color: palette.text, ...TYPOGRAPHY.label }}
                          >
                            {line.label}
                          </Text>
                          <Text
                            maxFontSizeMultiplier={TEXT_MAX_SCALE}
                            style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                          >
                            Berücksichtigte Zeit: {formatMinutes(line.minutes)} h{"\n"}
                            {line.percentage} % · Stundenbasis {formatEuro(line.hourlyRate)}/h
                          </Text>
                        </View>
                        <Text
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                        >
                          {formatEuro(line.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })}
        </>
      )}
    </>
  );
}
