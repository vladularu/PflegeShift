import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import type { MonthlyPayEstimate } from "@/domain/types";
import { ExpandableHighlightCard } from "@/features/analysis/expandable-highlight-card";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { CardSeparator } from "@/ui/design-system";

export function formatEuro(value: number | null): string {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
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
