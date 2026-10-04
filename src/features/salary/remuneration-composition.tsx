import { Fragment } from "react";
import { Text, View } from "react-native";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { summarizeSupplements } from "@/engine/remuneration-supplement-result";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";
import { RemunerationComponentCard } from "./remuneration-positions";
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
}: {
  readonly result: MonthlyRemuneration;
  readonly profiles: readonly DatedRemunerationProfile[];
  readonly onPremiums: () => void;
}) {
  const palette = usePalette();
  const allowances = new Map<string, (typeof result.allowances.positions)[number][]>();
  for (const position of result.allowances.positions) {
    const label =
      position.label === "Pflegezulage" && position.source.packageId === "tvoed-vka-bt-k"
        ? "Pflegezulage TVöD-P"
        : position.label;
    allowances.set(label, [...(allowances.get(label) ?? []), position]);
  }
  const rows = [
    { title: "Grundentgelt", component: result.base },
    { title: "Zeitzuschläge", component: result.timePremiums, onPress: onPremiums },
    ...(!result.allowances.complete && allowances.size === 0
      ? [{ title: "Zulagen", component: result.allowances }]
      : []),
    ...[...allowances].map(([title, positions]) => ({
      title,
      component: summarizeSupplements(positions),
    })),
    ...(!result.overtime.complete || result.overtime.totalCents !== 0
      ? [{ title: "Überstunden", component: result.overtime }]
      : []),
    ...(result.annualPayments.positions.length
      ? [{ title: "Jahressonderzahlung", component: result.annualPayments }]
      : []),
  ];
  return (
    <SurfaceCard testID="salary-composition">
      <View style={{ padding: SPACING.lg, gap: SPACING.xxs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
        >
          Zusammensetzung
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          {compositionLabel(result, profiles)}
        </Text>
      </View>
      <CardSeparator />
      <View style={{ paddingHorizontal: SPACING.lg }}>
        {rows.map((row, index) => (
          <Fragment key={row.title}>
            {index > 0 ? <CardSeparator inset={0} /> : null}
            <RemunerationComponentCard
              compact
              title={row.title}
              component={row.component}
              onPress={"onPress" in row ? row.onPress : undefined}
            />
          </Fragment>
        ))}
      </View>
    </SurfaceCard>
  );
}
