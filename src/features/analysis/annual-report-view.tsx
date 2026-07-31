import { Pressable, ScrollView, Text, View } from "react-native";

import { SHIFT_TYPE_LABELS, type ShiftType } from "@/domain/types";
import { formatMonthTitle } from "@/engine/calendar";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import type { AnnualReport } from "@/features/analysis/annual-report";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { MetricCard, SectionHeader, SurfaceCard } from "@/ui/design-system";

export type AnalysisPeriod = "MONTH" | "YEAR";

export function AnalysisPeriodPicker({
  value,
  onChange,
}: {
  readonly value: AnalysisPeriod;
  readonly onChange: (value: AnalysisPeriod) => void;
}) {
  const palette = usePalette();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        width: "100%",
        minHeight: 48,
        flexDirection: "row",
        borderRadius: 18,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
        boxShadow: palette.dark ? undefined : "0 3px 14px rgba(28, 48, 42, 0.05)",
        padding: 4,
      }}
    >
      {(["MONTH", "YEAR"] as const).map((item) => {
        const selected = value === item;
        return (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item)}
            style={({ pressed }) => ({
              minWidth: 0,
              minHeight: 40,
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              backgroundColor: selected ? palette.primarySoft : "transparent",
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: 12,
            })}
          >
            <Text
              selectable
              style={{
                color: selected ? palette.primary : palette.textMuted,
                fontSize: 13,
                fontWeight: "800",
              }}
            >
              {item === "MONTH" ? "Monat" : "Jahr"}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 48 }}
    >
      <AnalysisPeriodPicker value="YEAR" onChange={onChangePeriod} />

      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <YearButton direction="back" onPress={() => onMoveYear(-1)} />
        <View style={{ alignItems: "center", gap: 2 }}>
          <Text
            selectable
            style={{ color: palette.text, fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] }}
          >
            {report.year}
          </Text>
          <Text selectable style={{ color: palette.textMuted, fontSize: 11 }}>
            {report.activeMonthCount} Monate mit Einträgen
          </Text>
        </View>
        <YearButton direction="forward" onPress={() => onMoveYear(1)} />
      </View>

      <View
        style={{
          gap: 18,
          borderRadius: 28,
          borderCurve: "continuous",
          backgroundColor: palette.dark ? "#19352E" : "#1E6D5D",
          boxShadow: "0 10px 28px rgba(20, 76, 64, 0.18)",
          padding: 22,
        }}
      >
        <View style={{ gap: 5 }}>
          <Text selectable style={{ color: "#B9E4D8", fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>
            JAHRESARBEITSZEIT
          </Text>
          <Text
            selectable
            adjustsFontSizeToFit
            numberOfLines={1}
            style={{
              color: "#FFFFFF",
              fontSize: 38,
              fontWeight: "900",
              fontVariant: ["tabular-nums"],
              letterSpacing: -1,
            }}
          >
            {formatMinutes(report.actualMinutes)}
          </Text>
          <Text selectable style={{ color: "#B9E4D8", fontSize: 12 }}>
            von {formatMinutes(report.targetMinutes)} Soll
          </Text>
        </View>
        <View style={{ height: 8, overflow: "hidden", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.16)" }}>
          <View style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 4, backgroundColor: "#8BE0C8" }} />
        </View>
        <View style={{ flexDirection: "row", gap: 18 }}>
          <HeroValue label="Saldo" value={formatSignedMinutes(report.balanceMinutes)} />
          <HeroValue label="Einträge" value={String(report.entryCount)} />
          <HeroValue label="Abdeckung" value={`${Math.round(progress * 100)} %`} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader
          title="Jahresverlauf"
          caption="Monat antippen, um Details zu öffnen."
        />
        <MonthlyBars report={report} testMonths={testMonths} onSelectMonth={onSelectMonth} />
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Zeit & Abwesenheit" />
        <SurfaceCard style={{ gap: 14, padding: 18 }}>
          <ValueRow label="Arbeitsdienste" value={formatMinutes(report.workMinutes)} />
          <ValueRow label="Fortbildung" value={formatMinutes(report.trainingMinutes)} />
          <ValueRow label="Urlaub" value={`${report.vacationDays} Tage`} />
          <ValueRow label="Krankheit" value={`${report.sickDays} Tage`} />
          <ValueRow label="Frei" value={`${report.freeDays} Tage`} />
        </SurfaceCard>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
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

      <View style={{ gap: 10 }}>
        <SectionHeader title="Dienstverteilung" />
        <DistributionList distribution={report.distribution} />
      </View>

      {testMonthCount > 0 ? (
        <View style={{ alignSelf: "center", borderRadius: 999, backgroundColor: palette.primarySoft, paddingHorizontal: 11, paddingVertical: 6 }}>
          <Text selectable style={{ color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 }}>
            {testMonthCount} TESTMONATE ENTHALTEN
          </Text>
        </View>
      ) : null}

      <Text selectable style={{ color: palette.textMuted, fontSize: 10, lineHeight: 15, textAlign: "center" }}>
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
              <Text selectable style={{ color: isTest ? palette.primary : palette.textMuted, fontSize: 9, fontWeight: isTest ? "900" : "700" }}>
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
  const items = [...distribution.entries()]
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);
  const total = items.reduce((sum, [, count]) => sum + count, 0);
  return (
    <SurfaceCard style={{ gap: 10, padding: 18 }}>
      {items.length === 0 ? (
        <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>Keine Dienste in diesem Jahr.</Text>
      ) : items.map(([type, count]) => (
        <View key={type} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: SHIFT_TYPE_COLORS[type] }} />
          <Text selectable style={{ flex: 1, color: palette.textSecondary, fontSize: 13 }}>{SHIFT_TYPE_LABELS[type]}</Text>
          <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
            {count}
          </Text>
          <Text selectable style={{ width: 34, color: palette.textMuted, fontSize: 11, textAlign: "right" }}>
            {total === 0 ? "0%" : `${Math.round((count / total) * 100)}%`}
          </Text>
        </View>
      ))}
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
        width: 42,
        height: 42,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 21,
        backgroundColor: palette.surface,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text style={{ color: palette.text, fontSize: 24 }}>{direction === "back" ? "‹" : "›"}</Text>
    </Pressable>
  );
}

function HeroValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={{ minWidth: 0, flex: 1, gap: 3 }}>
      <Text selectable style={{ color: "#B9E4D8", fontSize: 10 }}>{label}</Text>
      <Text selectable adjustsFontSizeToFit numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

function ValueRow({ label, value }: { readonly label: string; readonly value: string }) {
  const palette = usePalette();
  return (
    <View style={{ minHeight: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>{label}</Text>
      <Text selectable style={{ color: palette.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { readonly color: string; readonly label: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text selectable style={{ color: palette.textMuted, fontSize: 10 }}>{label}</Text>
    </View>
  );
}
