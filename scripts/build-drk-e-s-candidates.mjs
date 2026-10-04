import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { validateRulePackage } from "../src/rules/validation.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existing = JSON.parse(
  readFileSync(
    resolve(root, "rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json"),
    "utf8",
  ),
);
const heuristic = existing.sources.find((item) => item.id === "pflegeshift-tariff-assessment-v1");
if (!heuristic) throw new Error("Missing source for the inert work-pattern policy.");

const configs = [
  { family: "e", annex: "a1", title: "E-Gruppen", tableCount: 4 },
  { family: "s", annex: "a3", title: "S-Gruppen", tableCount: 3 },
];

for (const config of configs) {
  const source = JSON.parse(
    readFileSync(
      resolve(root, `rules/sources/drk-rtv-anlage-${config.annex}-${config.family}-tables.json`),
      "utf8",
    ),
  );
  if (
    source.kind !== "SOURCE_TABLE_ONLY" ||
    source.agreementId !== "drk-rtv" ||
    source.annexId !== `anlage-${config.annex}` ||
    source.tables.length !== config.tableCount
  )
    throw new Error(`Unexpected DRK ${config.family.toUpperCase()} source data.`);

  const officialSource = {
    id: "drk-btg-rtv-52",
    title: source.source.title,
    url: source.source.url,
    documentDate: source.source.documentDate,
    section: `${source.source.section}; PDF-Seiten ${source.source.pdfPages.join(", ")}`,
    sha256: source.source.sha256,
  };
  const sourceIds = [officialSource.id];
  const annexId = `anlage-${config.annex}`;
  const tableId = `${annexId}-${config.family}`;

  for (const table of source.tables) {
    const entries = table.rows.flatMap(([groupId, ...values]) =>
      values.flatMap((monthlyCents, index) =>
        monthlyCents === null ? [] : [{ groupId, stepId: `s${index + 1}`, monthlyCents }],
      ),
    );
    const pkg = {
      schemaVersion: 1,
      engineContractVersion: 17,
      packageId: `drk-rtv-${config.family}`,
      versionId: `${table.validFrom}-draft1`,
      kind: "TARIFF",
      label: `DRK-RTV · Anlage ${config.annex.toUpperCase()} · ${config.title} (nicht aktiviert)`,
      status: "DRAFT",
      validFrom: table.validFrom,
      validTo: table.validTo,
      jurisdiction: { country: "DE", federalStates: null },
      sources: [officialSource, heuristic],
      review: { status: "DRAFT", reviewedBy: null, reviewedAt: null, gitCommit: null },
      rounding: { moneyScale: 2, mode: "HALF_UP", stage: "PER_LINE" },
      rules: {
        selection: {
          familyId: "drk-rtv",
          engineId: `drk-rtv-${config.family}-v1`,
          employmentKind: "EMPLOYEE",
          variants: [
            {
              id: `ANLAGE_${config.annex.toUpperCase()}`,
              label: `Anlage ${config.annex.toUpperCase()} · ${config.title}`,
              specialPartId: annexId,
              sourceIds,
              regions: [
                {
                  id: "BTG",
                  label: "DRK-Bundestarifgemeinschaft",
                  payTableId: tableId,
                  sourceIds,
                },
              ],
            },
          ],
          capabilities: {
            basePay: "UNSUPPORTED",
            timePremiums: "UNSUPPORTED",
            allowances: "UNSUPPORTED",
            overtime: "UNSUPPORTED",
            annualPayment: "UNSUPPORTED",
          },
        },
        selector: { agreementId: "drk-rtv", specialPartId: annexId, payTableId: tableId },
        payTables: [{ id: tableId, entries, sourceIds }],
        premiumRules: [],
        allowanceRules: [],
        combinationRules: [],
        workPatternRules: [],
        workPatternPolicy: existing.rules.workPatternPolicy,
      },
    };
    const validation = validateRulePackage(pkg);
    if (!validation.ok)
      throw new Error(
        `${pkg.packageId}:${pkg.versionId}: ${JSON.stringify(validation.issues, null, 2)}`,
      );
    const target = resolve(root, `rules/packages/reviewed/${pkg.packageId}/${pkg.versionId}.json`);
    mkdirSync(dirname(target), { recursive: true });
    const formatted = await prettier.format(JSON.stringify(pkg), {
      ...((await prettier.resolveConfig(target)) ?? {}),
      filepath: target,
    });
    writeFileSync(target, formatted);
    process.stdout.write(`Generated ${target}\n`);
  }
}
