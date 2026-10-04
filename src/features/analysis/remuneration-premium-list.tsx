import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type {
  TimeRemunerationPosition,
  TimeRemunerationResult,
} from "@/domain/remuneration-result";
import type { ShiftEntry } from "@/domain/types";
import { formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { RemunerationText } from "@/features/salary/remuneration-positions";
import { RemunerationPremiumLine } from "./remuneration-premium-line";
import { remunerationEuro, REMUNERATION_STATUS } from "@/features/salary/remuneration-presentation";
import { usePalette } from "@/theme/palette";
import { MINIMUM_TOUCH_TARGET, RADII, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CardSeparator, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";
import { AnalysisDetailSummaryCard } from "./analysis-detail-layout";

function category(position: TimeRemunerationPosition) {
  return position.label.startsWith("Feiertag") ? "Feiertag" : position.label;
}
function amount(positions: readonly TimeRemunerationPosition[]) {
  const known = positions.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
  return positions.every((p) => p.amountCents !== null)
    ? remunerationEuro(known)
    : known > 0
      ? "Teilbetrag: " + remunerationEuro(known)
      : "Nicht berechenbar";
}

export function RemunerationPremiumList({
  month,
  result,
  shifts,
}: {
  readonly month: string;
  readonly result: TimeRemunerationResult;
  readonly shifts: readonly ShiftEntry[];
}) {
  const palette = usePalette();
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const categories = [...new Set(result.positions.map(category))];
  const activeFilter = filter !== null && categories.includes(filter) ? filter : null;
  const selected = result.positions.filter(
    (p) => activeFilter === null || category(p) === activeFilter,
  );
  const grouped = new Map<string, TimeRemunerationPosition[]>();
  for (const position of selected) {
    // A null shiftId is a genuine daily aggregate. Do not assign it to a guessed shift.
    const key = position.shiftId === null ? "day:" + position.from : "shift:" + position.shiftId;
    grouped.set(key, [...(grouped.get(key) ?? []), position]);
  }
  const rows = [...grouped]
    .map(([key, positions]) => ({
      key,
      positions,
      date: positions.map((p) => p.from).sort()[0],
      shift:
        positions[0].shiftId === null
          ? undefined
          : shifts.find((s) => s.id === positions[0].shiftId),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const countLabel = rows.some((row) => row.key.startsWith("day:"))
    ? "Einträge"
    : rows.length === 1
      ? "Dienst"
      : "Dienste";
  const issues = [...new Set(result.positions.flatMap((p) => (p.issue ? [p.issue.message] : [])))];
  return (
    <View style={{ gap: SPACING.lg }}>
      <AnalysisDetailSummaryCard
        emphasis="metric"
        period={formatMonthTitle(month)}
        title={remunerationEuro(result.totalCents)}
        caption={
          result.complete
            ? "Zeitzuschläge im gesamten Monat"
            : "Zeitzuschläge im gesamten Monat · " +
              REMUNERATION_STATUS[result.status] +
              " · bekannter Teilbetrag: " +
              remunerationEuro(result.knownSubtotalCents)
        }
      />
      <SectionHeader
        title="Nach Zuschlagsart"
        caption="Wähle eine Art für die zugehörigen Dienste."
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
        {[null, ...categories].map((item) => {
          const label = item ?? "Alle";
          const value = amount(
            result.positions.filter((p) => item === null || category(p) === item),
          );
          const selectedFilter = item === activeFilter;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label + ", " + value}
              accessibilityState={{ selected: selectedFilter }}
              onPress={() => {
                setFilter(item);
                setExpanded(null);
                selectionFeedback();
              }}
              style={({ pressed }) => ({
                minHeight: MINIMUM_TOUCH_TARGET,
                padding: SPACING.md,
                gap: SPACING.xxs,
                borderRadius: RADII.control,
                borderWidth: 1,
                borderColor: selectedFilter ? palette.primary : palette.border,
                backgroundColor: selectedFilter ? palette.primarySoft : palette.surface,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{ color: palette.text, ...TYPOGRAPHY.label }}
              >
                {selectedFilter ? "✓ " : ""}
                {label}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
              >
                {value}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <SectionHeader
        title="Dienste"
        caption={
          activeFilter === null
            ? rows.length + " " + countLabel + " · chronologisch"
            : "Gefiltert: " +
              activeFilter +
              " · " +
              amount(selected) +
              " · " +
              rows.length +
              " " +
              countLabel
        }
      />
      {rows.map((row) => {
        const isExpanded = expanded === row.key;
        const title =
          row.shift?.title ?? (row.key.startsWith("day:") ? "Zeitzuschläge des Tages" : "Dienst");
        return (
          <SurfaceCard key={row.key}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                formatDateTitle(row.date) + ", " + title + ", " + amount(row.positions)
              }
              accessibilityState={{ expanded: isExpanded }}
              onPress={() => {
                setExpanded(isExpanded ? null : row.key);
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
                  {formatDateTitle(row.date)}
                </Text>
                <Ionicons
                  accessibilityElementsHidden
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  color={palette.textMuted}
                  size={18}
                />
              </View>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
              >
                {title}
                {row.shift?.startTime ? " · " + row.shift.startTime + "–" + row.shift.endTime : ""}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
              >
                {amount(row.positions)}
              </Text>
            </Pressable>
            {isExpanded ? (
              <View style={{ padding: SPACING.lg, paddingTop: 0, gap: SPACING.md }}>
                <CardSeparator inset={0} />
                {row.positions.map((position) => (
                  <RemunerationPremiumLine key={position.id} position={position} />
                ))}
              </View>
            ) : null}
          </SurfaceCard>
        );
      })}
      {issues.length ? (
        <SurfaceCard style={{ padding: SPACING.lg, gap: SPACING.sm }}>
          {issues.map((issue) => (
            <RemunerationText key={issue} muted>
              {issue}
            </RemunerationText>
          ))}
        </SurfaceCard>
      ) : null}
    </View>
  );
}
