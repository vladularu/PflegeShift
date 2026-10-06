import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";
import layout from "./simple-tariff-table-layout.json";

export function simpleTariffTableIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const data = pkg.rules.simpleTariffTables;
  if (!data)
    return pkg.engineContractVersion === 19
      ? [
          {
            code: "SIMPLE_TABLE_DATA_REQUIRED",
            path: "/rules/simpleTariffTables",
            message: "Contract 19 requires tariff tables.",
          },
        ]
      : [];
  if (pkg.engineContractVersion !== 19)
    return [
      {
        code: "SIMPLE_TABLE_CONTRACT_MISMATCH",
        path: "/engineContractVersion",
        message: "Tariff tables require contract 19.",
      },
    ];
  const issues: ValidationIssue[] = [];
  const fail = (code: string, path: string) =>
    issues.push({ code, path, message: "Invalid simple tariff table dataset." });
  const sources = new Set(pkg.sources.map((source) => source.id));
  const families = Object.keys(layout) as (keyof typeof layout)[];
  for (const family of families) {
    const tables = data.tables
      .filter((table) => table.tariffId === family)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    if (tables.length === 0)
      fail("SIMPLE_TABLE_FAMILY_MISSING", "/rules/simpleTariffTables/tables");
    let previousEnd: string | null | undefined;
    for (const table of tables) {
      const path = `/rules/simpleTariffTables/tables/${data.tables.indexOf(table)}`;
      try {
        Temporal.PlainDate.from(table.validFrom);
        if (table.validTo !== null) Temporal.PlainDate.from(table.validTo);
      } catch {
        fail("SIMPLE_TABLE_INVALID_DATE", path);
      }
      if (table.validTo !== null && table.validFrom > table.validTo)
        fail("SIMPLE_TABLE_INVALID_RANGE", path);
      if (previousEnd === null || (previousEnd !== undefined && table.validFrom <= previousEnd))
        fail("SIMPLE_TABLE_OVERLAP", path);
      if (previousEnd !== undefined && previousEnd !== null) {
        try {
          if (Temporal.PlainDate.from(previousEnd).add({ days: 1 }).toString() !== table.validFrom)
            fail("SIMPLE_TABLE_GAP", path);
        } catch {
          /* invalid date already reported */
        }
      }
      previousEnd = table.validTo;
      const keys = table.entries.map((entry) => `${entry.groupId}:${entry.stepId}`).sort();
      const required = [...layout[family]].sort();
      if (keys.length !== required.length || keys.some((key, index) => key !== required[index]))
        fail("SIMPLE_TABLE_LAYOUT_MISMATCH", path + "/entries");
      if (table.sourceIds.length === 0 || table.sourceIds.some((id) => !sources.has(id)))
        fail("SIMPLE_TABLE_SOURCE_MISSING", path + "/sourceIds");
    }
  }
  return issues;
}
