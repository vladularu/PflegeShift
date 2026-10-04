import { Fragment, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { settingsInfoRoute } from "@/navigation/routes";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { summarizeSupplements } from "@/engine/remuneration-supplement-result";

import { SPACING } from "@/theme/tokens";

import { CardFooterLine, CardHeader, CardSeparator, SurfaceCard } from "@/ui/design-system";
import { SalaryValueRow } from "./salary-value-row";
import { RemunerationDetailSheet } from "./remuneration-detail-sheet";
import { remunerationEuro, REMUNERATION_STATUS } from "./remuneration-presentation";
import type { MonthlyRemuneration } from "./remuneration-presentation";

function compositionLabel(
  result: MonthlyRemuneration,
  profiles: readonly DatedRemunerationProfile[],
) {
  const contexts = new Set(
    result.base.positions.map(
      (p) => p.source.profileEffectiveFrom + ":" + p.source.profileRevision,
    ),
  );
  if (contexts.size !== 1) return "Mehrere Vergütungsstände";
  const source = result.base.positions[0]?.source;
  const profile = profiles.find(
    (p) =>
      p.effectiveFrom === source?.profileEffectiveFrom && p.revision === source.profileRevision,
  );
  const selection = profile?.data.selection;
  if (!selection || selection.kind === "unconfigured") return "Vergütung für diesen Monat";
  if (selection.kind !== "tariff") return "Eigene Vergütung";
  const names: Readonly<Record<string, string>> = {
    "tvoed-vka-bt-k": "TVöD-P",
    "tvl-kr-tdl": "TV-L",
    "tvaoed-pflege-vka": "TVAöD · Pflege",
    "tval-pflege-tdl": "TVA-L · Pflege",
  };
  const name = names[selection.packageId] ?? "Tarif";
  return (
    name +
    " " +
    selection.group +
    (selection.packageId.startsWith("tva") ? "" : " · Stufe " + selection.level)
  );
}

export function RemunerationComposition({
  result,
  profiles,
  onPremiums,
  onShiftAllowance,
  onAnnualPayment,
  onOvertime,
}: {
  readonly result: MonthlyRemuneration;
  readonly profiles: readonly DatedRemunerationProfile[];
  readonly onPremiums: () => void;
  readonly onShiftAllowance: () => void;
  readonly onAnnualPayment: () => void;
  readonly onOvertime: () => void;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const allowances = new Map<string, (typeof result.allowances.positions)[number][]>();
  for (const position of result.allowances.positions) {
    const tvoed = position.source.packageId === "tvoed-vka-bt-k";
    const label =
      tvoed && position.label === "Pflegezulage"
        ? "Pflegezulage TVöD-P"
        : tvoed && position.label === "Tarifliche Zulage"
          ? "TVöD-Zulage"
          : tvoed && /schichtzulage/i.test(position.label)
            ? position.status === "estimated"
              ? "Schichtzulage · Muster & Angaben"
              : "Schichtzulage"
            : position.label;
    allowances.set(label, [...(allowances.get(label) ?? []), position]);
  }
  const rank = (title: string) =>
    /Schichtzulage/.test(title)
      ? 0
      : title === "TVöD-Zulage"
        ? 1
        : title === "Pflegezulage TVöD-P"
          ? 2
          : 3;
  const rows = [
    { title: "Grundentgelt", component: result.base },
    { title: "Zeitzuschläge", component: result.timePremiums, onPress: onPremiums },
    ...(!result.overtime.complete || result.overtime.totalCents !== 0
      ? [{ title: "Überstunden", component: result.overtime }]
      : []),
    ...(!result.allowances.complete && allowances.size === 0
      ? [{ title: "Zulagen", component: result.allowances }]
      : []),
    ...[...allowances]
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([title, positions]) => ({
        title,
        component: summarizeSupplements(positions),
      })),
    ...(result.annualPayments.positions.length
      ? [{ title: "Jahressonderzahlung", component: result.annualPayments }]
      : []),
  ];
  const selected = rows.find((row) => row.title === detail);
  const actions: Record<string, () => void> = {
    "TVöD-Zulage": () => router.push(settingsInfoRoute("TVOED_ALLOWANCE")),
    "Pflegezulage TVöD-P": () => router.push(settingsInfoRoute("CARE_ALLOWANCE")),
  };
  function openDetails(row: (typeof rows)[number]) {
    if ("onPress" in row && row.onPress) {
      row.onPress();
      return;
    }
    const tvoed =
      row.component.positions.length > 0 &&
      row.component.positions.every((p) => p.source.packageId === "tvoed-vka-bt-k");
    if (tvoed && actions[row.title]) {
      actions[row.title]();
      return;
    }
    if (tvoed && /^Schichtzulage/.test(row.title)) {
      onShiftAllowance();
      return;
    }
    setDetail(row.title);
  }
  return (
    <>
      <SurfaceCard testID="salary-composition">
        <CardHeader title="Zusammensetzung" caption={compositionLabel(result, profiles)} />
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm }}>
          {rows.map((row, index) => (
            <Fragment key={row.title}>
              {index > 0 ? <CardSeparator inset={0} /> : null}
              <SalaryValueRow
                label={row.title}
                value={remunerationEuro(row.component.totalCents)}
                accessibilityLabel={row.title + ", Details öffnen"}
                valueDescription={
                  row.component.totalCents === null
                    ? REMUNERATION_STATUS[row.component.status]
                    : remunerationEuro(row.component.totalCents) +
                      " · " +
                      REMUNERATION_STATUS[row.component.status]
                }
                infoVisible={row.title !== "Grundentgelt"}
                onPress={() => openDetails(row)}
                onLongPress={() => setDetail(row.title)}
              />
            </Fragment>
          ))}
        </View>
        <CardFooterLine />
      </SurfaceCard>
      <RemunerationDetailSheet
        title={selected?.title ?? "Gehalt"}
        positions={selected?.component.positions ?? null}
        onClose={() => setDetail(null)}
        action={
          selected?.title === "Jahressonderzahlung"
            ? { label: "Jahressonderzahlungen bearbeiten", onPress: onAnnualPayment }
            : selected?.title === "Überstunden"
              ? { label: "Überstunden den Tagen zuordnen", onPress: onOvertime }
              : undefined
        }
      />
    </>
  );
}
