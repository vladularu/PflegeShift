import Ionicons from "@expo/vector-icons/Ionicons";
import { Temporal } from "@js-temporal/polyfill";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";

import type { MonthlyPayEstimate } from "@/domain/types";
import { formatMinutes } from "@/engine/working-time";
import type { MonthlyShiftTypeAnalysis } from "@/features/analysis/analysis-metrics";
import { SHIFT_TYPE_LABELS } from "@/domain/types";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { DEFAULT_SHIFT_SYMBOLS } from "@/theme/shift-symbols";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, MINIMUM_TOUCH_TARGET, RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, ColorBadge, SurfaceCard } from "@/ui/design-system";
import { TabScreenHeader } from "@/ui/screen-layout";

const HIGHLIGHT_TITLE_TYPOGRAPHY = {
  fontSize: 17,
  lineHeight: 22,
  fontWeight: "600",
  letterSpacing: -0.2,
} as const;

const HIGHLIGHT_VALUE_TYPOGRAPHY = {
  fontSize: 32,
  lineHeight: 38,
  fontWeight: "700",
  letterSpacing: -0.6,
} as const;

const HIGHLIGHT_COUNT_TYPOGRAPHY = {
  fontSize: 24,
  lineHeight: 29,
  fontWeight: "700",
  letterSpacing: -0.4,
} as const;

const HIGHLIGHT_COUNT_LABEL_TYPOGRAPHY = {
  fontSize: 22,
  lineHeight: 28,
  fontWeight: "600",
  letterSpacing: -0.3,
} as const;

const HIGHLIGHT_SUMMARY_TYPOGRAPHY = {
  fontSize: 13,
  lineHeight: 18,
  fontWeight: "500",
} as const;

export function formatMonthRangeLabel(month: string): string {
  const value = Temporal.PlainYearMonth.from(month);
  const firstDay = value.toPlainDate({ day: 1 });
  const date = new Date(`${firstDay.toString()}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(/\.$/, "");
  const monthLabel = new Intl.DateTimeFormat("de-DE", {
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(/\.$/, "");
  return `${weekday}. 1. ${monthLabel}. - ${value.daysInMonth}. ${monthLabel}. ${value.year}`;
}

export function AnalysisMonthHeader({
  label,
  onPrevious,
  onNext,
  onOpenYear,
}: {
  readonly label: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onOpenYear: () => void;
}) {
  return (
    <AnalysisPeriodHeader
      label={label}
      nextAccessibilityLabel={`Nächster Monat, aktuell ${label}`}
      onNext={onNext}
      onPrevious={onPrevious}
      onToggle={onOpenYear}
      previousAccessibilityLabel={`Vorheriger Monat, aktuell ${label}`}
      testID="analysis-month-toolbar"
      toggleAccessibilityLabel="Jahresauswertung öffnen"
    />
  );
}

export function AnalysisYearHeader({
  year,
  activeMonthCount,
  onPrevious,
  onNext,
  onOpenMonth,
}: {
  readonly year: number;
  readonly activeMonthCount: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onOpenMonth: () => void;
}) {
  const label = String(year);
  return (
    <AnalysisPeriodHeader
      label={label}
      nextAccessibilityLabel={`Nächstes Jahr, aktuell ${label}`}
      onNext={onNext}
      onPrevious={onPrevious}
      onToggle={onOpenMonth}
      previousAccessibilityLabel={`Vorheriges Jahr, aktuell ${label}`}
      secondaryLabel={`${activeMonthCount} Monate mit Einträgen`}
      testID="analysis-year-toolbar"
      toggleAccessibilityLabel="Monatsauswertung öffnen"
    />
  );
}

function AnalysisPeriodHeader({
  label,
  secondaryLabel,
  previousAccessibilityLabel,
  nextAccessibilityLabel,
  toggleAccessibilityLabel,
  testID,
  onPrevious,
  onNext,
  onToggle,
}: {
  readonly label: string;
  readonly secondaryLabel?: string;
  readonly previousAccessibilityLabel: string;
  readonly nextAccessibilityLabel: string;
  readonly toggleAccessibilityLabel: string;
  readonly testID: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onToggle: () => void;
}) {
  const palette = usePalette();
  return (
    <TabScreenHeader
      accessory={
        <Pressable
          accessibilityLabel={toggleAccessibilityLabel}
          accessibilityRole="button"
          onPress={onToggle}
          style={({ pressed }) => ({
            width: CONTROL_HEIGHT.compact,
            height: CONTROL_HEIGHT.compact,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: palette.separator,
            borderRadius: RADII.pill,
            backgroundColor: pressed ? palette.surfaceMuted : palette.surface,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <Ionicons accessible={false} color={palette.text} name="calendar-outline" size={21} />
        </Pressable>
      }
      surface="groupedBackground"
      title="Auswertung"
      toolbar={
        <View
          accessibilityRole="toolbar"
          testID={testID}
          style={{
            minHeight: MINIMUM_TOUCH_TARGET,
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: -SPACING.sm,
          }}
        >
          <PeriodArrow
            accessibilityLabel={previousAccessibilityLabel}
            direction="back"
            onPress={onPrevious}
          />
          <View style={{ minWidth: 0, flex: 1, alignItems: "center", gap: SPACING.xxs }}>
            <Text
              accessibilityLiveRegion="polite"
              dynamicTypeRamp="body"
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{
                color: palette.text,
                textAlign: "center",
                ...(secondaryLabel ? TYPOGRAPHY.bodyStrong : TYPOGRAPHY.body),
                fontVariant: ["tabular-nums"],
              }}
            >
              {label}
            </Text>
            {secondaryLabel ? (
              <Text
                dynamicTypeRamp="caption1"
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.caption }}
              >
                {secondaryLabel}
              </Text>
            ) : null}
          </View>
          <PeriodArrow
            accessibilityLabel={nextAccessibilityLabel}
            direction="forward"
            onPress={onNext}
          />
        </View>
      }
    />
  );
}

function PeriodArrow({
  accessibilityLabel,
  direction,
  onPress,
}: {
  readonly accessibilityLabel: string;
  readonly direction: "back" | "forward";
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const previous = direction === "back";
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: MINIMUM_TOUCH_TARGET,
        height: MINIMUM_TOUCH_TARGET,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADII.control,
        backgroundColor: pressed ? palette.primarySoft : "transparent",
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Ionicons
        color={palette.textSecondary}
        name={previous ? "chevron-back" : "chevron-forward"}
        size={20}
      />
    </Pressable>
  );
}

export function ReportCardTitle({ title }: { readonly title: string }) {
  const palette = usePalette();
  return (
    <View
      style={{
        minHeight: 54,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.text, textAlign: "center", ...TYPOGRAPHY.sectionTitle }}
      >
        {title}
      </Text>
    </View>
  );
}

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
                alignItems: "center",
                gap: SPACING.md,
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
                style={{ minWidth: 0, flex: 1, color: palette.text, ...TYPOGRAPHY.body }}
              >
                {SHIFT_TYPE_LABELS[item.type]}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{
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
          flexDirection: "row",
          alignItems: "center",
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
  const stacked = fontScale >= 1.6;
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
              flex: 1,
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
                fontSize: 18,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
                letterSpacing: -0.3,
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

export function formatEuro(value: number | null): string {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function ExpandableHighlightCard({
  title,
  value,
  countBadge,
  summary,
  icon,
  accent,
  expanded,
  onToggle,
  children,
}: {
  readonly title: string;
  readonly value: string;
  readonly countBadge?: number;
  readonly summary?: string;
  readonly icon: ComponentProps<typeof Ionicons>["name"];
  readonly accent: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const accessibleValue = countBadge === undefined ? value : `${countBadge} ${value}`;
  return (
    <Animated.View
      layout={LinearTransition.duration(MOTION.duration.normal).reduceMotion(MOTION.reduceMotion)}
    >
      <SurfaceCard
        style={{
          borderColor: `${accent}52`,
          backgroundColor: `${accent}10`,
        }}
      >
        <Pressable
          accessibilityHint={expanded ? "Blendet die Details aus" : "Blendet die Details ein"}
          accessibilityLabel={[title, accessibleValue, summary].filter(Boolean).join(", ")}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onToggle}
          style={({ pressed }) => ({
            minHeight: 100,
            gap: SPACING.sm,
            backgroundColor: pressed ? `${accent}18` : "transparent",
            opacity: pressed ? 0.78 : 1,
            paddingHorizontal: SPACING.xl,
            paddingVertical: SPACING.md,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
            <View
              accessibilityElementsHidden
              style={{
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: RADII.control,
                backgroundColor: `${accent}1F`,
              }}
            >
              <Ionicons color={accent} name={icon} size={15} />
            </View>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ minWidth: 0, flex: 1, color: accent, ...HIGHLIGHT_TITLE_TYPOGRAPHY }}
            >
              {title}
            </Text>
            <Ionicons
              accessibilityElementsHidden
              color={palette.textMuted}
              name={expanded ? "chevron-up" : "chevron-down"}
              size={19}
            />
          </View>
          <View style={{ gap: SPACING.xxs }}>
            {countBadge === undefined ? (
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{
                  color: palette.text,
                  ...HIGHLIGHT_VALUE_TYPOGRAPHY,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {value}
              </Text>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: `${accent}52`,
                    borderRadius: RADII.pill,
                    backgroundColor: `${accent}1F`,
                  }}
                >
                  <Text
                    style={{
                      color: accent,
                      ...HIGHLIGHT_COUNT_TYPOGRAPHY,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {countBadge}
                  </Text>
                </View>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{
                    minWidth: 0,
                    flex: 1,
                    color: palette.text,
                    ...HIGHLIGHT_COUNT_LABEL_TYPOGRAPHY,
                  }}
                >
                  {value}
                </Text>
              </View>
            )}
            {summary ? (
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.textMuted, ...HIGHLIGHT_SUMMARY_TYPOGRAPHY }}
              >
                {summary}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {expanded ? (
          <Animated.View
            entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
            exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(MOTION.reduceMotion)}
          >
            <CardSeparator inset={0} />
            {children}
          </Animated.View>
        ) : null}
      </SurfaceCard>
    </Animated.View>
  );
}

interface SalaryDetailRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly onPress?: () => void;
}

export function SalarySummaryCard({
  pay,
  tariffReady,
  expanded,
  onToggle,
  onSetup,
  onOpenAllowance,
}: {
  readonly pay: MonthlyPayEstimate;
  readonly tariffReady: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onSetup: () => void;
  readonly onOpenAllowance: () => void;
}) {
  const palette = usePalette();
  const value = !tariffReady
    ? "Einrichten"
    : !pay.available
      ? "Nicht verfügbar"
      : formatEuro(pay.estimatedGrossAmount);
  const summary = !tariffReady
    ? "Tarifprofil fehlt"
    : !pay.available
      ? "Für diesen Monat liegt kein unterstützter Tarifstand vor"
      : `Brutto-Schätzung · ${pay.tariffLabel}`;
  const visibleSummary = tariffReady && pay.available ? undefined : summary;
  const rows: readonly SalaryDetailRow[] =
    !tariffReady || !pay.available
      ? []
      : [
          { key: "base", label: "Grundentgelt", value: formatEuro(pay.personalBaseAmount) },
          { key: "premium", label: "Zeitzuschläge", value: formatEuro(pay.timePremiumAmount) },
          ...(pay.overtimeAmount > 0
            ? [{ key: "overtime", label: "Überstunden", value: formatEuro(pay.overtimeAmount) }]
            : []),
          ...(pay.allowanceAmount > 0 ||
          pay.assessment.requiresConfirmation ||
          pay.assessment.suggestedAllowance !== "NONE"
            ? [
                {
                  key: "shift-allowance",
                  label: pay.confirmedAllowance ? "Schichtzulage" : "Schichtzulage prüfen",
                  value: pay.allowanceAmount > 0 ? formatEuro(pay.allowanceAmount) : "Prüfen",
                  onPress: onOpenAllowance,
                },
              ]
            : []),
          ...(pay.tvoedAllowanceAmount > 0
            ? [
                {
                  key: "tvoed",
                  label: "TVöD-Zulage",
                  value: formatEuro(pay.tvoedAllowanceAmount),
                },
              ]
            : []),
          ...(pay.careAllowanceAmount > 0
            ? [
                {
                  key: "care",
                  label: "Pflegezulage TVöD-P",
                  value: formatEuro(pay.careAllowanceAmount),
                },
              ]
            : []),
        ];
  return (
    <ExpandableHighlightCard
      accent={palette.primary}
      expanded={expanded}
      icon="wallet-outline"
      onToggle={onToggle}
      summary={visibleSummary}
      title="Gehalt"
      value={value}
    >
      {!tariffReady ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSetup}
          style={({ pressed }) => ({
            minHeight: 56,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: SPACING.md,
            backgroundColor: pressed ? palette.surfaceMuted : "transparent",
            opacity: pressed ? 0.72 : 1,
            paddingHorizontal: SPACING.lg,
            paddingVertical: SPACING.sm,
          })}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.primary, ...TYPOGRAPHY.bodyStrong }}
          >
            Tarifprofil einrichten
          </Text>
          <Ionicons color={palette.textMuted} name="chevron-forward" size={18} />
        </Pressable>
      ) : !pay.available ? (
        <View style={{ padding: SPACING.lg }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
          >
            Wähle einen unterstützten Monat oder aktualisiere dein Tarifprofil.
          </Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <View style={{ gap: SPACING.xxs, paddingBottom: SPACING.md, paddingTop: SPACING.md }}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
            >
              Zusammensetzung
            </Text>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
            >
              {pay.tariffLabel}
            </Text>
          </View>
          {rows.map((row, index) => (
            <View key={row.key}>
              {index > 0 ? <CardSeparator inset={0} /> : null}
              <SalaryDetailRowView palette={palette} row={row} />
            </View>
          ))}
        </View>
      )}
    </ExpandableHighlightCard>
  );
}

function SalaryDetailRowView({
  row,
  palette,
}: {
  readonly row: SalaryDetailRow;
  readonly palette: ReturnType<typeof usePalette>;
}) {
  const content = (
    <>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ minWidth: 0, flex: 1, color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        {row.label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{
            color: palette.text,
            ...TYPOGRAPHY.bodyStrong,
            fontVariant: ["tabular-nums"],
          }}
        >
          {row.value}
        </Text>
        {row.onPress ? (
          <Ionicons
            accessibilityElementsHidden
            color={palette.textMuted}
            name="chevron-forward"
            size={17}
          />
        ) : null}
      </View>
    </>
  );
  const style = {
    minHeight: 56,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  };
  if (!row.onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityLabel={`${row.label}, ${row.value}`}
      accessibilityRole="button"
      onPress={row.onPress}
      style={({ pressed }) => [style, { opacity: pressed ? 0.72 : 1 }]}
    >
      {content}
    </Pressable>
  );
}
