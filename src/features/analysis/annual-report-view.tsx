import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, Text, View } from "react-native";

import { SHIFT_TYPE_LABELS, type ShiftType } from "@/domain/types";
import { formatMonthTitle } from "@/engine/calendar";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { buildAnnualDistributionSections } from "@/features/analysis/annual-distribution";
import type { AnnualReport } from "@/features/analysis/annual-report";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { MetricCard, SectionHeader, SegmentedControl, SurfaceCard } from "@/ui/design-system";

export type AnalysisPeriod = "MONTH" | "YEAR";

export function AnalysisPeriodPicker({
  value,
  onChange,
}: {
  readonly value: AnalysisPeriod;
  readonly onChange: (value: AnalysisPeriod) => void;
}) {
  return (
    <SegmentedControl
      items={[{ value: "MONTH", label: "Monat" }, { value: "YEAR", label: "Jahr" }]}
      onChange={(nextValue) => onChange(nextValue as AnalysisPeriod)}
      value={value}
    />
  );
}

export function AnnualReportScreen({
  report,
  testMonths,
  onChangePeriod,
  onMoveYear,
  onSelectMonth,
}: {
  readonly report: AnnualReport;
  readonly testMonths: readonly string[];
  readonly onChangePeriod: (period: AnalysisPeriod) => void;
  readonly onMoveYear: (delta: number) => void;
  readonly onSelectMonth: (month: string) => void;
}) {
  const palette = usePalette();
  const progress = report.targetMinutes === 0
    ? 0
    : Math.max(0, Math.min(1, report.actualMinutes / report.targetMinutes));
  const testMonthCount = report.months.filter((item) => testMonths.includes(item.month)).length;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: SPACING.lg, padding: SPACING.lg, paddingBottom: 48 }}
    >
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <YearButton direction="back" onPress={() => onMoveYear(-1)} />
        <View style={{ alignItems: "center", gap: SPACING.xxs }}>
          <Text
            selectable
            style={{ color: palette.text, ...TYPOGRAPHY.screenTitle, fontVariant: ["tabular-nums"] }}
          >
            {report.year}
          </Text>
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}>
            {report.activeMonthCount} Monate mit Einträgen
          </Text>
        </View>
        <YearButton direction="forward" onPress={() => onMoveYear(1)} />
      </View>

      <AnalysisPeriodPicker value="YEAR" onChange={onChangePeriod} />

      <SurfaceCard
        style={{
          gap: SPACING.lg,
          borderColor: `${palette.primary}2E`,
          backgroundColor: palette.primarySoft,
          padding: SPACING.xl,
        }}
      >
        <View style={{ gap: SPACING.xs }}>
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.primary, ...TYPOGRAPHY.overline }}>
            JAHRESARBEITSZEIT
          </Text>
          <Text
            selectable
            adjustsFontSizeToFit
            numberOfLines={1}
            style={{
              color: palette.text,
              ...TYPOGRAPHY.hero,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatMinutes(report.actualMinutes)}
          </Text>
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}>
            von {formatMinutes(report.targetMinutes)} Soll
          </Text>
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}>
            Dienste {formatMinutes(report.workMinutes)}
            {report.trainingMinutes > 0 ? ` · Fortbildung ${formatMinutes(report.trainingMinutes)}` : ""}
          </Text>
        </View>
        <View style={{ height: 6, overflow: "hidden", borderRadius: 3, backgroundColor: palette.surface }}>
          <View style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 3, backgroundColor: palette.primary }} />
        </View>
        <View style={{ flexDirection: "row", gap: 18 }}>
          <HeroValue label="Saldo" value={formatSignedMinutes(report.balanceMinutes)} />
          <HeroValue label="Einträge" value={String(report.entryCount)} />
          <HeroValue label="Abdeckung" value={`${Math.round(progress * 100)} %`} />
        </View>
      </SurfaceCard>

      <View style={{ gap: SPACING.sm }}>
        <SectionHeader
          title="Jahresverlauf"
          caption="Monat antippen, um Details zu öffnen."
        />
        <MonthlyBars report={report} testMonths={testMonths} onSelectMonth={onSelectMonth} />
      </View>

      <View style={{ flexDirection: "row", gap: SPACING.sm }}>
        <MetricCard
          label="ArbZG kritisch"
          value={String(report.criticalCount)}
          accent={report.criticalCount > 0 ? palette.danger : palette.primary}
        />
        <MetricCard
          label="Planungshinweise"
          value={String(report.warningCount)}
          accent={report.warningCount > 0 ? palette.warning : palette.primary}
        />
      </View>

      <View style={{ gap: SPACING.sm }}>
        <SectionHeader
          title="Verteilung"
          caption="Anteile beziehen sich nur auf Dienste."
        />
        <DistributionList distribution={report.distribution} />
      </View>

      {testMonthCount > 0 ? (
        <View style={{ alignSelf: "center", borderRadius: RADII.pill, backgroundColor: palette.primarySoft, paddingHorizontal: 11, paddingVertical: SPACING.xs }}>
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.primary, ...TYPOGRAPHY.overline }}>
            {testMonthCount} TESTMONATE ENTHALTEN
          </Text>
        </View>
      ) : null}

      <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.footnote }}>
        Automatische Jahresauswertung · keine Rechtsberatung
      </Text>
    </ScrollView>
  );
}

function MonthlyBars({
  report,
  testMonths,
  onSelectMonth,
}: {
  readonly report: AnnualReport;
  readonly testMonths: readonly string[];
  readonly onSelectMonth: (month: string) => void;
}) {
  const palette = usePalette();
  const maximum = Math.max(1, ...report.months.map((item) => Math.max(item.actualMinutes, item.targetMinutes)));
  return (
    <SurfaceCard style={{ gap: 12, padding: 16 }}>
      <View style={{ height: 112, flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
        {report.months.map((item) => {
          const height = Math.max(3, (item.actualMinutes / maximum) * 82);
          const hasIssue = item.criticalCount > 0 || item.warningCount > 0;
          const isTest = testMonths.includes(item.month);
          return (
            <Pressable
              key={item.month}
              accessibilityLabel={`${formatMonthTitle(item.month)}, ${formatMinutes(item.actualMinutes)} Ist`}
              accessibilityRole="button"
              onPress={() => onSelectMonth(item.month)}
              style={({ pressed }) => ({
                minWidth: 0,
                flex: 1,
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 5,
                opacity: pressed ? 0.58 : 1,
              })}
            >
              <View style={{ width: "72%", height, minHeight: 3, borderRadius: 5, backgroundColor: hasIssue ? palette.warning : palette.primary }} />
              <Text selectable style={{ color: isTest ? palette.primary : palette.textMuted, fontSize: 11, fontWeight: isTest ? "700" : "500" }}>
                {new Intl.DateTimeFormat("de-DE", { month: "narrow", timeZone: "UTC" }).format(new Date(`${item.month}-01T00:00:00Z`))}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <LegendDot color={palette.primary} label="Arbeitszeit" />
        <LegendDot color={palette.warning} label="mit Hinweis" />
      </View>
    </SurfaceCard>
  );
}

function DistributionList({ distribution }: { readonly distribution: ReadonlyMap<ShiftType, number> }) {
  const palette = usePalette();
  const sections = buildAnnualDistributionSections(distribution);
  const hasEntries = sections.services.length > 0 || sections.absences.length > 0;
  return (
    <SurfaceCard style={{ gap: 14, padding: 18 }}>
      {!hasEntries ? (
        <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>Keine Einträge in diesem Jahr.</Text>
      ) : null}

      {sections.services.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.overline }}>
            DIENSTE & FORTBILDUNG
          </Text>
          {sections.services.map(({ type, count, percentage }) => (
            <View key={type} style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 9 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: SHIFT_TYPE_COLORS[type] }} />
              <Text selectable style={{ flex: 1, color: palette.textSecondary, fontSize: 13 }}>{SHIFT_TYPE_LABELS[type]}</Text>
              <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.text, ...TYPOGRAPHY.label, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                {count}
              </Text>
              <Text selectable style={{ width: 38, color: palette.textMuted, fontSize: 12, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                {percentage}%
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {sections.services.length > 0 && sections.absences.length > 0 ? (
        <View style={{ height: 1, backgroundColor: palette.border }} />
      ) : null}

      {sections.absences.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.overline }}>
            ABWESENHEITEN
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {sections.absences.map(({ type, count }) => (
              <View
                key={type}
                style={{
                  minWidth: 104,
                  minHeight: 52,
                  flexGrow: 1,
                  flexBasis: 0,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: RADII.control,
                  borderCurve: "continuous",
                  backgroundColor: palette.surfaceRaised,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: SHIFT_TYPE_COLORS[type] }} />
                <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
                  <Text selectable numberOfLines={1} style={{ color: palette.textSecondary, fontSize: 12 }}>
                    {SHIFT_TYPE_LABELS[type]}
                  </Text>
                  <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.text, ...TYPOGRAPHY.label, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                    {count} {count === 1 ? "Tag" : "Tage"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </SurfaceCard>
  );
}

function YearButton({ direction, onPress }: { readonly direction: "back" | "forward"; readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={direction === "back" ? "Vorheriges Jahr" : "Nächstes Jahr"}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: CONTROL_HEIGHT.compact,
        height: CONTROL_HEIGHT.compact,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADII.control,
        backgroundColor: pressed ? palette.primarySoft : "transparent",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Ionicons accessibilityElementsHidden color={palette.textSecondary} name={direction === "back" ? "chevron-back" : "chevron-forward"} size={20} />
    </Pressable>
  );
}

function HeroValue({ label, value }: { readonly label: string; readonly value: string }) {
  const palette = usePalette();
  return (
    <View style={{ minWidth: 0, flex: 1, gap: SPACING.xxs }}>
      <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}>{label}</Text>
      <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable adjustsFontSizeToFit numberOfLines={1} style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

function LegendDot({ color, label }: { readonly color: string; readonly label: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text selectable style={{ color: palette.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
