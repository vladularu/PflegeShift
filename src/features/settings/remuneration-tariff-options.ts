import type { RuleResolver } from "@/rules/rule-resolver";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { LEGACY_RULE_PACKAGE_IDS } from "@/rules/bundled-rules";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { resolveRemunerationContext } from "@/engine/remuneration-context";
import {
  requireRemunerationDate,
  type RemunerationProfileData,
} from "@/domain/remuneration-profile";
import { tariffFullTimeWeeklyMinutes } from "@/domain/employment-profile";
import { TARIFF_REGION_LABELS } from "@/domain/types";

export interface RemunerationTariffOption {
  readonly id: string;
  readonly label: string;
  readonly employmentKind?: "APPRENTICE";
  readonly supportNote?: string;
  readonly variants: readonly {
    readonly id: string;
    readonly label: string;
    readonly regions: readonly {
      readonly id: string;
      readonly label: string;
      readonly fullTimeWeeklyMinutes: number;
    }[];
  }[];
  readonly groups: readonly {
    readonly id: string;
    readonly label?: string;
    readonly levels: readonly string[];
    readonly periodKind?: "TRAINING_YEAR" | "TRAINING_MONTH_BRACKET";
    readonly levelLabels?: Readonly<Record<string, string>>;
  }[];
}

export function remunerationTariffOptions(date: string, resolver: RuleResolver) {
  requireRemunerationDate(date);
  const available: RemunerationTariffOption[] = [];
  const unavailable: { id: string; label: string; reason: string }[] = [];
  for (const id of resolver.tariffPackageIds ?? []) {
    const resolved = resolver.resolveTariff(date, id);
    if (!resolved.ok) {
      unavailable.push({
        id,
        label: id,
        reason: "Für dieses Datum kein eindeutiges Tarifpaket verfügbar.",
      });
      continue;
    }
    const rule = resolved.value;
    const packageId =
      resolver === bundledRuleResolver && id === LEGACY_RULE_PACKAGE_IDS.tariff
        ? "tvoed-vka-bt-k"
        : id;
    const table = rule.rules.payTables.find((item) => item.id === rule.rules.selector.payTableId);
    const metadata = rule.rules.selection;
    const knownTvoed = ["tvoed-vka-bt-k", LEGACY_RULE_PACKAGE_IDS.tariff].includes(id);
    const tvl =
      id === "tvl-kr-tdl" &&
      rule.engineContractVersion === 12 &&
      metadata?.familyId === "tvl-kr" &&
      metadata.engineId === "tvl-kr-v1" &&
      metadata.employmentKind === "EMPLOYEE";
    const tval =
      id === "tval-pflege-tdl" &&
      rule.engineContractVersion === 13 &&
      metadata?.familyId === "tval-pflege" &&
      metadata.engineId === "tval-pflege-v1" &&
      metadata.employmentKind === "APPRENTICE";
    const training =
      id === "tvaoed-pflege-vka" &&
      [10, 11].includes(rule.engineContractVersion) &&
      metadata?.familyId === "tvaoed-pflege" &&
      metadata.engineId === "tvaoed-pflege-v1" &&
      metadata.employmentKind === "APPRENTICE";
    if (
      (!knownTvoed && !training && !tvl && !tval) ||
      !table ||
      (!training &&
        !tvl &&
        !tval &&
        metadata &&
        (metadata.familyId !== "tvoed-p" || metadata.engineId !== "tvoed-p-v3"))
    ) {
      unavailable.push({
        id,
        label: rule.label,
        reason: "Berechnungsanbindung noch nicht unterstützt.",
      });
      continue;
    }
    const grouped = new Map<string, string[]>();
    for (const row of table.entries) {
      if (
        !(tval
          ? /^(regular|assistant)$/.test(row.groupId)
          : training
            ? /^[bc]$/.test(row.groupId)
            : tvl
              ? /^kr(?:[5-9]|1[0-7])$/.test(row.groupId)
              : /^p[1-9]\d*$/.test(row.groupId)) ||
        !(tvl || tval ? /^[1-6]$/.test(row.stepId) : /^s[1-9]\d*$/.test(row.stepId))
      )
        continue;
      const group = training || tval ? row.groupId : row.groupId.toUpperCase(),
        level = tvl || tval ? row.stepId : row.stepId.slice(1);
      const levels = grouped.get(group) ?? [];
      if (!levels.includes(level)) levels.push(level);
      grouped.set(group, levels);
    }
    const groups = [...grouped]
      .sort(([a], [b]) => (tvl ? Number(a.slice(2)) - Number(b.slice(2)) : 0))
      .map(([id, levels]) => ({
        id,
        levels,
        ...(tval
          ? (() => {
              const category = rule.rules.tvalTrainingPay?.categories.find((c) => c.groupId === id);
              return {
                label: category?.label,
                periodKind: category?.periodKind,
                levelLabels: Object.fromEntries(category?.levels.map((l) => [l.id, l.label]) ?? []),
              };
            })()
          : {}),
        ...(training
          ? {
              label: rule.rules.trainingPay?.categories.find((category) => category.groupId === id)
                ?.label,
            }
          : {}),
      }));
    const declared =
      metadata?.variants ??
      (["BT_K", "BT_B"] as const).map((variant) => ({
        id: variant,
        label: variant === "BT_K" ? "Krankenhaus · BT-K" : "Pflege · BT-B",
        regions: (["KAV_BW", "OTHER"] as const).map((region) => ({
          id: region,
          label: TARIFF_REGION_LABELS[region],
        })),
      }));
    const variants: RemunerationTariffOption["variants"][number][] = [];
    for (const variant of declared) {
      const regions: RemunerationTariffOption["variants"][number]["regions"][number][] = [];
      for (const region of variant.regions) {
        if (metadata && resolveTariffSelection(rule, variant.id, region.id) === null) continue;
        if (
          !tvl &&
          !tval &&
          (!["BT_K", "BT_B"].includes(variant.id) || !["KAV_BW", "OTHER"].includes(region.id))
        )
          continue;
        const datedWorkingTimes =
          tvl || tval
            ? rule.rules.employmentWorkingTimeRules?.filter(
                (item) =>
                  item.variantId === variant.id &&
                  item.regionId === region.id &&
                  item.validFrom <= date &&
                  (item.validTo === null || date <= item.validTo),
              )
            : undefined;
        if ((tvl || tval) && datedWorkingTimes?.length !== 1) continue;
        const first = groups[0];
        if (!first) continue;
        const data: RemunerationProfileData = {
          version: 1,
          weeklyMinutes: 60,
          selection: {
            kind: "tariff",
            packageId,
            variant: variant.id,
            region: region.id,
            group: first.id,
            level: first.levels[0],
            fullTimeWeeklyMinutes:
              tvl || tval
                ? datedWorkingTimes![0].fullTimeWeeklyMinutes
                : tariffFullTimeWeeklyMinutes(
                    variant.id as "BT_K" | "BT_B",
                    region.id as "KAV_BW" | "OTHER",
                  ),
          },
        };
        const context = resolveRemunerationContext(
          date,
          [
            {
              effectiveFrom: date,
              data,
              revision: 1,
              createdAt: "2000-01-01T00:00:00Z",
              updatedAt: "2000-01-01T00:00:00Z",
            },
          ],
          resolver,
        );
        if (
          context.kind === "tariff" ||
          context.kind === "training-tariff" ||
          context.kind === "tvl-kr" ||
          context.kind === "tval-training"
        )
          regions.push({
            id: region.id,
            label: region.label,
            fullTimeWeeklyMinutes: context.fullTimeWeeklyMinutes,
          });
      }
      if (regions.length) variants.push({ id: variant.id, label: variant.label, regions });
    }
    if (variants.length && groups.length)
      available.push({
        id: packageId,
        label: metadata ? rule.label : "TVöD-P",
        variants,
        groups,
        ...(training || tval ? { employmentKind: "APPRENTICE" as const } : {}),
        ...(tval
          ? {
              supportNote:
                "TVA-L Pflege: Ausbildungsentgelt, bestätigte Schichtzulagen und Jahressonderzahlung mit ergänzten Angaben berechenbar; Zeitzuschläge und Tätigkeitszulagen noch unvollständig, kein vollständiges Gesamtbrutto. Geltungsbereich nach § 1, Arbeitgeberregelung und Vollzeitkonstellation ausdrücklich bestätigen. Keine automatische Zuordnung alter Pflegehilfe oder dualer Studiengänge. Abweichende minderjährige Ausbildungszeiten sind noch nicht abgebildet.",
            }
          : {}),
        ...(tvl
          ? {
              supportNote:
                "TV-L/KR: Tabellenentgelt und belegte Zeitzuschläge sind berechenbar. Samstagsvoraussetzungen und weitere Zulagen sind noch unvollständig; kein vollständiges Gesamtbrutto. Tarifgebiet und Voraussetzungen ausdrücklich bestätigen, nicht aus dem Bundesland ableiten.",
            }
          : {}),
      });
    else
      unavailable.push({
        id,
        label: rule.label,
        reason: "Auswahl oder Tarifkomponenten werden noch nicht unterstützt.",
      });
  }
  return { available, unavailable };
}
