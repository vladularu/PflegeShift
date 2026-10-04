import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { validateRulePackage } from "../src/rules/validation.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceTables = JSON.parse(
  readFileSync(resolve(root, "rules/sources/drk-rtv-anlage-a2-p-tables.json"), "utf8"),
);
if (
  sourceTables.kind !== "SOURCE_TABLE_ONLY" ||
  sourceTables.agreementId !== "drk-rtv" ||
  sourceTables.annexId !== "anlage-a2" ||
  sourceTables.tables.length !== 3
)
  throw new Error("Unexpected DRK P source data.");

// The generic work-pattern policy is structurally required but inert for this DRAFT.
const existing = JSON.parse(
  readFileSync(
    resolve(root, "rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json"),
    "utf8",
  ),
);
const heuristic = existing.sources.find((item) => item.id === "pflegeshift-tariff-assessment-v1");
if (!heuristic) throw new Error("Missing source for the inert work-pattern policy.");

const officialSource = {
  id: "drk-btg-rtv-52",
  title: sourceTables.source.title,
  url: sourceTables.source.url,
  documentDate: sourceTables.source.documentDate,
  section: `${sourceTables.source.section}; PDF-Seiten ${sourceTables.source.pdfPages.join(", ")}`,
  sha256: sourceTables.source.sha256,
};

function candidate(table) {
  const sourceIds = [officialSource.id];
  const entries = table.rows.flatMap(([groupId, ...values]) =>
    values.flatMap((monthlyCents, index) =>
      monthlyCents === null ? [] : [{ groupId, stepId: `s${index + 1}`, monthlyCents }],
    ),
  );
  return {
    schemaVersion: 1,
    engineContractVersion: 17,
    packageId: "drk-rtv-p",
    versionId: `${table.validFrom}-draft1`,
    kind: "TARIFF",
    label: "DRK-RTV · Anlage A2 · P-Gruppen (nicht aktiviert)",
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
        engineId: "drk-rtv-p-v1",
        employmentKind: "EMPLOYEE",
        variants: [
          {
            id: "ANLAGE_A2",
            label: "Anlage A2 · P-Gruppen",
            specialPartId: "anlage-a2",
            sourceIds,
            regions: [
              {
                id: "BTG",
                label: "DRK-Bundestarifgemeinschaft",
                payTableId: "anlage-a2-p",
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
      selector: { agreementId: "drk-rtv", specialPartId: "anlage-a2", payTableId: "anlage-a2-p" },
      payTables: [{ id: "anlage-a2-p", entries, sourceIds }],
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      workPatternPolicy: existing.rules.workPatternPolicy,
    },
  };
}

for (const table of sourceTables.tables) {
  const pkg = candidate(table);
  const validation = validateRulePackage(pkg);
  if (!validation.ok)
    throw new Error(`${pkg.versionId}: ${JSON.stringify(validation.issues, null, 2)}`);
  const target = resolve(root, `rules/packages/reviewed/drk-rtv-p/${pkg.versionId}.json`);
  mkdirSync(dirname(target), { recursive: true });
  const formatted = await prettier.format(JSON.stringify(pkg), {
    ...((await prettier.resolveConfig(target)) ?? {}),
    filepath: target,
  });
  writeFileSync(target, formatted);
  process.stdout.write(`Generated ${target}\n`);
}
