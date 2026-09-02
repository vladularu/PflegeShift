import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { SHIFT_TYPE_LABELS, type ShiftType } from "@/domain/types";
import { formatMonthTitle } from "@/engine/calendar";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { buildAnnualDistributionSections } from "@/features/analysis/annual-distribution";
import { AnalysisCoverageNote } from "@/features/analysis/analysis-coverage-note";
import type { AnnualReport } from "@/features/analysis/annual-report";
import {
  AnalysisYearHeader,
  ExpandableHighlightCard,
  formatEuro,
  ReportCardTitle,
  WorktimeCard,
} from "@/features/analysis/analysis-overview-cards";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";
import { ReportFootnote, ReportPeriodContent, ReportScrollView } from "@/ui/report-layout";

export type AnalysisPeriod = "MONTH" | "YEAR";

export function AnnualReportScreen({
  report,
  testMonths,
  onBackToMonth,
  onMoveYear,
  onSelectMonth,
}: {
  readonly report: AnnualReport;
  readonly testMonths: readonly string[];
  readonly onBackToMonth: () => void;
  readonly onMoveYear: (delta: number) => void;
  readonly onSelectMonth: (month: string, expandedCard?: "CHECK") => void;
}) {
  const palette = usePalette();
  const [expandedCard, setExpandedCard] = useState<"CHECK" | "PAY" | null>(null);
  const testMonthCount = report.months.filter((item) => testMonths.includes(item.month)).length;

  function toggleExpandedCard(nextCard: "CHECK" | "PAY") {
    setExpandedCard((current) => (current === nextCard ? null : nextCard));
    selectionFeedback();
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <AnalysisYearHeader
        activeMonthCount={report.activeMonthCount}
        onNext={() => onMoveYear(1)}
        onOpenMonth={onBackToMonth}
        onPrevious={() => onMoveYear(-1)}
        year={report.year}
      />
      <ReportScrollView>
        <ReportPeriodContent>
          {testMonthCount > 0 ? <AnnualTestBadge count={testMonthCount} /> : null}

          {report.complianceCoverageComplete ? (
            <AnnualCheckCard
              expanded={expandedCard === "CHECK"}
              onSelectMonth={(month) => onSelectMonth(month, "CHECK")}
              onToggle={() => toggleExpandedCard("CHECK")}
              report={report}
            />
          ) : (
            <AnalysisCoverageNote message="Die Jahresprüfung benötigt vollständige Regelstände. Erfasste Zeiten und Schichten bleiben sichtbar." />
          )}

          <AnnualSalaryCard
            expanded={expandedCard === "PAY"}
            onToggle={() => toggleExpandedCard("PAY")}
            report={report}
          />

          <WorktimeCard
            actual={formatMinutes(report.actualMinutes)}
            balance={
              report.balanceMinutes === null
                ? "Nicht verfügbar"
                : formatSignedMinutes(report.balanceMinutes)
            }
            balanceAccent={
              report.balanceMinutes === null
                ? palette.textMuted
                : report.balanceMinutes < 0
                  ? palette.danger
                  : palette.success
            }
            target={
              report.targetMinutes === null
                ? "Nicht verfügbar"
                : formatMinutes(report.targetMinutes)
            }
          />

          {!report.worktimeCoverageComplete ? (
            <AnalysisCoverageNote message="Soll, Saldo und Abwesenheitsgutschriften sind ohne vollständigen Feiertagsstand nicht verfügbar. Angezeigt werden sicher berechenbare Arbeits- und Fortbildungszeiten." />
          ) : null}

          <MonthlyBars report={report} testMonths={testMonths} onSelectMonth={onSelectMonth} />

          <DistributionList distribution={report.distribution} />

          <ReportFootnote>
            Unverbindliche Schätzung · automatische Prüfung · keine Rechtsberatung
          </ReportFootnote>
        </ReportPeriodContent>
      </ReportScrollView>
    </View>
  );
}

function AnnualTestBadge({ count }: { readonly count: number }) {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel={`${count} Testmonate enthalten`}
      style={{
        alignSelf: "center",
        borderRadius: RADII.pill,
        backgroundColor: palette.primarySoft,
        paddingHorizontal: 11,
        paddingVertical: SPACING.xs,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.primary, ...TYPOGRAPHY.overline }}
      >
        {count} TESTMONATE ENTHALTEN
      </Text>
    </View>
  );
}

function AnnualCheckCard({
  report,
  expanded,
  onToggle,
  onSelectMonth,
}: {
  readonly report: AnnualReport;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onSelectMonth: (month: string) => void;
}) {
  const palette = usePalette();
  const issueMonths = report.months.filter(
    (item) => item.criticalCount > 0 || item.warningCount > 0,
  );
  const clear = report.criticalCount === 0 && report.warningCount === 0;
  const accent = clear
    ? palette.success
    : report.criticalCount > 0
      ? palette.danger
      : palette.warning;
  const messageCount = report.criticalCount + report.warningCount;

  return (
    <ExpandableHighlightCard
      accent={accent}
      countBadge={messageCount}
      expanded={expanded}
      icon={clear ? "shield-checkmark-outline" : "warning-outline"}
      onToggle={onToggle}
      title="Prüfung"
      value={messageCount === 1 ? "Meldung" : "Meldungen"}
    >
      {issueMonths.length === 0 ? (
        <View style={{ padding: SPACING.lg }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.success, ...TYPOGRAPHY.bodyStrong }}
          >
            In keinem Monat wurden Auffälligkeiten erkannt.
          </Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {issueMonths.map((item, index) => (
            <View key={item.month}>
              {index > 0 ? <CardSeparator inset={0} /> : null}
              <Pressable
                accessibilityHint="Öffnet den Monat mit der aufgeklappten Monatsauswertung"
                accessibilityRole="button"
                onPress={() => onSelectMonth(item.month)}
                style={({ pressed }) => ({
                  minHeight: 58,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.md,
                  backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                  opacity: pressed ? 0.72 : 1,
                  paddingVertical: SPACING.sm,
                })}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: item.criticalCount > 0 ? palette.danger : palette.warning,
                  }}
                />
                <View style={{ minWidth: 0, flex: 1, gap: SPACING.xxs }}>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                  >
                    {formatMonthTitle(item.month)}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                  >
                    {item.criticalCount + item.warningCount}{" "}
                    {item.criticalCount + item.warningCount === 1 ? "Meldung" : "Meldungen"}
                  </Text>
                </View>
                <Ionicons color={palette.textMuted} name="chevron-forward" size={18} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ExpandableHighlightCard>
  );
}

function AnnualSalaryCard({
  report,
  expanded,
  onToggle,
}: {
  readonly report: AnnualReport;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const palette = usePalette();
  const available = report.availablePayMonthCount > 0;
  const rows = [
    {
      label: "Berücksichtigte Monate",
      value: `${report.availablePayMonthCount} von 12`,
    },
    { label: "Zeitzuschläge", value: formatEuro(report.premiumAmount) },
    { label: "Überstunden", value: formatEuro(report.overtimeAmount) },
    { label: "Zulagen", value: formatEuro(report.allowanceAmount) },
  ];
  return (
    <ExpandableHighlightCard
      accent={palette.primary}
      expanded={expanded}
      icon="wallet-outline"
      onToggle={onToggle}
      summary={
        available
          ? `Summe aus ${report.availablePayMonthCount} von 12 Monatsschätzungen`
          : "Keine unterstützte Monatsschätzung verfügbar"
      }
      title="Gehalt"
      value={available ? formatEuro(report.estimatedGrossAmount) : "Nicht verfügbar"}
    >
      {available ? (
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {rows.map((row, index) => (
            <View key={row.label}>
              {index > 0 ? <CardSeparator inset={0} /> : null}
              <View
                style={{
                  minHeight: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: SPACING.md,
                  paddingVertical: SPACING.sm,
                }}
              >
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ minWidth: 0, flex: 1, color: palette.textMuted, ...TYPOGRAPHY.label }}
                >
                  {row.label}
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
                  {row.value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ padding: SPACING.lg }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
          >
            Ohne eingerichtete Gehaltsgrundlage werden keine Beträge ausgewiesen.
          </Text>
        </View>
      )}
    </ExpandableHighlightCard>
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
  const maximum = Math.max(
    1,
    ...report.months.map((item) => Math.max(item.actualMinutes, item.targetMinutes ?? 0)),
  );
  return (
    <SurfaceCard>
      <ReportCardTitle title="Jahresverlauf" />
      <CardSeparator inset={0} />
      <View style={{ gap: SPACING.md, padding: SPACING.lg }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          Monat antippen, um die Monatsauswertung zu öffnen.
        </Text>
        <View style={{ height: 112, flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
          {report.months.map((item, index) => {
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
                <Animated.View
                  entering={FadeInUp.delay(index * 24)
                    .duration(MOTION.duration.normal)
                    .reduceMotion(MOTION.reduceMotion)}
                  style={{
                    width: "72%",
                    height,
                    minHeight: 3,
                    borderRadius: 5,
                    backgroundColor: hasIssue ? palette.warning : palette.primary,
                  }}
                />
                <Text
                  selectable
                  style={{
                    color: isTest ? palette.primary : palette.textMuted,
                    fontSize: 11,
                    fontWeight: isTest ? "700" : "500",
                  }}
                >
                  {new Intl.DateTimeFormat("de-DE", { month: "narrow", timeZone: "UTC" }).format(
                    new Date(`${item.month}-01T00:00:00Z`),
                  )}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <LegendDot color={palette.primary} label="Arbeitszeit" />
          <LegendDot color={palette.warning} label="mit Hinweis" />
        </View>
      </View>
    </SurfaceCard>
  );
}

function DistributionList({
  distribution,
}: {
  readonly distribution: ReadonlyMap<ShiftType, number>;
}) {
  const palette = usePalette();
  const sections = buildAnnualDistributionSections(distribution);
  const hasEntries = sections.services.length > 0 || sections.absences.length > 0;
  return (
    <SurfaceCard>
      <ReportCardTitle title="Dienstverteilung" />
      <CardSeparator inset={0} />
      <View style={{ gap: 14, padding: SPACING.lg }}>
        {!hasEntries ? (
          <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>
            Keine Einträge in diesem Jahr.
          </Text>
        ) : null}

        {sections.services.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.textMuted, ...TYPOGRAPHY.overline }}
            >
              DIENSTE & FORTBILDUNG
            </Text>
            {sections.services.map(({ type, count, percentage }, index) => (
              <Animated.View
                key={type}
                entering={FadeInUp.delay(index * 28)
                  .duration(MOTION.duration.normal)
                  .reduceMotion(MOTION.reduceMotion)}
                style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 9 }}
              >
                <View
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: SHIFT_TYPE_COLORS[type],
                  }}
                />
                <Text selectable style={{ flex: 1, color: palette.textSecondary, fontSize: 13 }}>
                  {SHIFT_TYPE_LABELS[type]}
                </Text>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{
                    color: palette.text,
                    ...TYPOGRAPHY.label,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {count}
                </Text>
                <Text
                  selectable
                  style={{
                    width: 38,
                    color: palette.textMuted,
                    fontSize: 12,
                    textAlign: "right",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {percentage}%
                </Text>
              </Animated.View>
            ))}
          </View>
        ) : null}

        {sections.services.length > 0 && sections.absences.length > 0 ? (
          <View style={{ height: 1, backgroundColor: palette.border }} />
        ) : null}

        {sections.absences.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.textMuted, ...TYPOGRAPHY.overline }}
            >
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
                  <View
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: SHIFT_TYPE_COLORS[type],
                    }}
                  />
                  <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      selectable
                      style={{ color: palette.textSecondary, fontSize: 12 }}
                    >
                      {SHIFT_TYPE_LABELS[type]}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      selectable
                      style={{
                        color: palette.text,
                        ...TYPOGRAPHY.label,
                        fontWeight: "700",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {count} {count === 1 ? "Tag" : "Tage"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </SurfaceCard>
  );
}

function LegendDot({ color, label }: { readonly color: string; readonly label: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text selectable style={{ color: palette.textMuted, fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}
