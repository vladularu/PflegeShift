import Ionicons from "@expo/vector-icons/Ionicons";
import { Temporal } from "@js-temporal/polyfill";
import { Pressable, Text, View } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, MINIMUM_TOUCH_TARGET, RADII, SPACING } from "@/theme/tokens";
import { TabScreenHeader } from "@/ui/screen-layout";

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
