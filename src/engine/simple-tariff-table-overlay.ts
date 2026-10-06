import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { RuleResolver, SimpleTariffData } from "@/rules/rule-resolver";

type Table = SimpleTariffData["tables"][number];
export type SimpleTariffFamily = Table["tariffId"];

/** Catalog validation has already checked dates, completeness, sources and overlaps. */
export function selectSimpleTariffTable(
  resolver: RuleResolver,
  family: SimpleTariffFamily,
  date: string,
): Table | null {
  const matches =
    resolver.simpleTariffData?.tables.filter(
      (table) =>
        table.tariffId === family &&
        table.validFrom <= date &&
        (table.validTo === null || date <= table.validTo),
    ) ?? [];
  if (matches.length > 1) throw new Error("Mehrdeutige geprüfte Tariftabelle.");
  return matches[0] ?? null;
}

export function simpleTariffTableAmount(table: Table, group: string, step: string): number {
  const rows = table.entries.filter((row) => row.groupId === group && row.stepId === step);
  if (rows.length !== 1) throw new Error("Unvollständige geprüfte Tariftabelle.");
  return rows[0].monthlyCents;
}

export function overlaySimpleTariffPackage(
  local: RuleTariffPackage,
  table: Table | null,
  resolver: RuleResolver,
): RuleTariffPackage {
  if (!table) return local;
  const sources = resolver.simpleTariffData!.sources.filter((source) =>
    table.sourceIds.includes(source.id),
  );
  return {
    ...local,
    validFrom: table.validFrom,
    validTo: table.validTo,
    sources: [
      ...local.sources.filter((source) => !table.sourceIds.includes(source.id)),
      ...sources,
    ] as RuleTariffPackage["sources"],
    rules: {
      ...local.rules,
      payTables: local.rules.payTables.map((payTable) =>
        payTable.id === local.rules.selector.payTableId
          ? { ...payTable, entries: table.entries, sourceIds: table.sourceIds }
          : payTable,
      ) as RuleTariffPackage["rules"]["payTables"],
    },
  };
}
