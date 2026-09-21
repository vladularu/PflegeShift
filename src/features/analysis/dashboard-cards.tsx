import { WorktimeCard } from "./analysis-report-cards";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { AnalysisCardId } from "@/domain/analysis-view";
import { usePalette } from "@/theme/palette";
import { TYPOGRAPHY } from "@/theme/typography";
import { AnalysisListCard, AnalysisValueRow } from "./analysis-list-card";
import { useAnalysisView } from "./analysis-view-preferences";
import { type CheckCounts, type ClassifiedCheckCounts } from "./check-visibility";
import { formatEuro } from "./salary-summary-card";

export function AnalysisDashboard({
  cards,
}: {
  readonly cards: Record<AnalysisCardId, ReactNode>;
}) {
  const { preferences } = useAnalysisView();
  const p = usePalette();
  const shown = preferences.order.filter((id) => !preferences.hidden.includes(id));
  return shown.length ? (
    <>
      {shown.map((id) => (
        <View key={id}>{cards[id]}</View>
      ))}
    </>
  ) : (
    <Text style={{ color: p.textMuted, ...TYPOGRAPHY.body }}>
      Deine Karten sind ausgeblendet. Über „Ansicht anpassen“ kannst du sie wieder anzeigen.
    </Text>
  );
}
export function WorkListCard({
  actual,
  target,
  balance,
  onPress,
  caption,
}: {
  readonly actual: string;
  readonly target: string;
  readonly balance: string;
  readonly onPress?: () => void;
  readonly caption?: string;
}) {
  const p = usePalette();
  const withoutUnit = (value: string) => value.replace(/ h$/u, "");
  return (
    <WorktimeCard
      actual={withoutUnit(actual)}
      target={withoutUnit(target)}
      balance={withoutUnit(balance)}
      balanceAccent={
        /[0-9]/u.test(balance) ? (/^[−-]/u.test(balance) ? p.danger : p.success) : p.textMuted
      }
      onPress={onPress}
      caption={caption}
    />
  );
}

export function checkCountLabel(counts: CheckCounts) {
  return (
    [
      counts.criticalCount ? counts.criticalCount + " kritisch" : "",
      counts.warningCount
        ? counts.warningCount + (counts.warningCount === 1 ? " Warnung" : " Warnungen")
        : "",
      counts.infoCount
        ? counts.infoCount + (counts.infoCount === 1 ? " Hinweis" : " Hinweise")
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Keine Auffälligkeiten"
  );
}
function CheckRow({
  label,
  counts,
  first,
}: {
  readonly label: string;
  readonly counts: CheckCounts;
  readonly first?: boolean;
}) {
  const p = usePalette();
  const total = counts.criticalCount + counts.warningCount + counts.infoCount;
  return (
    <AnalysisValueRow
      label={label}
      first={first}
      value={checkCountLabel(counts)}
      icon={
        counts.criticalCount || counts.warningCount
          ? "warning-outline"
          : total
            ? "information-circle-outline"
            : "checkmark-circle-outline"
      }
      iconColor={
        counts.criticalCount
          ? p.danger
          : counts.warningCount
            ? p.warning
            : total
              ? p.info
              : p.success
      }
    />
  );
}
export function CheckListCard({
  counts,
  categories,
  showPlanning,
  onPress,
  status,
  caption,
}: {
  readonly counts: CheckCounts;
  readonly categories?: ClassifiedCheckCounts;
  readonly showPlanning: boolean;
  readonly onPress: () => void;
  readonly status?: string;
  readonly caption?: string;
}) {
  const total = counts.criticalCount + counts.warningCount + counts.infoCount;
  const label =
    status ??
    (total
      ? total + (total === 1 ? " Meldung" : " Meldungen")
      : "Keine sichtbaren Auffälligkeiten");
  return (
    <AnalysisListCard
      title="Prüfung"
      label={"Prüfung, " + label}
      onPress={onPress}
      caption={caption}
    >
      {status ? (
        <AnalysisValueRow first label="Status" value={status} />
      ) : categories ? (
        <>
          <CheckRow first label="Gesetzliche Prüfung" counts={categories.legal} />
          {showPlanning ? (
            <CheckRow label="Freiwillige Planung" counts={categories.planning} />
          ) : null}
        </>
      ) : (
        <CheckRow first label="Meldungen" counts={counts} />
      )}
    </AnalysisListCard>
  );
}
export function PayListCard({
  onPress,
  base,
  premiums,
  overtime,
  allowances,
  gross,
  manual = false,
  status,
  caption,
}: {
  readonly onPress: () => void;
  readonly base?: number | null;
  readonly premiums?: number;
  readonly overtime?: number;
  readonly allowances?: number;
  readonly gross?: number | null;
  readonly manual?: boolean;
  readonly status?: string;
  readonly caption: string;
}) {
  return (
    <AnalysisListCard
      title="Gehalt"
      label={"Gehalt, " + (status ?? formatEuro(gross ?? null))}
      onPress={onPress}
      caption={caption}
    >
      {status ? (
        <AnalysisValueRow reserveDisclosure first label="Status" value={status} />
      ) : manual ? (
        <AnalysisValueRow
          reserveDisclosure
          first
          total
          label={base == null ? "Brutto gesamt" : "Monatsbrutto"}
          value={formatEuro(gross ?? null)}
        />
      ) : (
        <>
          {base != null ? (
            <AnalysisValueRow
              reserveDisclosure
              first
              label={manual ? "Monatsbrutto" : "Grundgehalt"}
              value={formatEuro(base)}
            />
          ) : null}
          {!manual && premiums != null ? (
            <AnalysisValueRow
              reserveDisclosure
              first={base == null}
              label="Zeitzuschläge"
              value={formatEuro(premiums)}
            />
          ) : null}
          {!manual && !!overtime ? (
            <AnalysisValueRow
              reserveDisclosure
              label="Überstundenvergütung"
              value={formatEuro(overtime)}
            />
          ) : null}
          {!manual && !!allowances ? (
            <AnalysisValueRow
              reserveDisclosure
              label="Weitere Zulagen"
              value={formatEuro(allowances)}
            />
          ) : null}
          <AnalysisValueRow
            reserveDisclosure
            first={base == null && premiums == null}
            total
            label="Brutto gesamt"
            value={formatEuro(gross ?? null)}
          />
        </>
      )}
    </AnalysisListCard>
  );
}
