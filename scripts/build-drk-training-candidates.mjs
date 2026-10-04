import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { validateRulePackage } from "../src/rules/validation.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(
  readFileSync(resolve(root, "rules/sources/drk-rtv-anlage-3-training-tables.json"), "utf8"),
);
if (
  source.kind !== "SOURCE_TABLE_ONLY" ||
  source.agreementId !== "drk-rtv" ||
  source.tables.length !== 3 ||
  source.categories.length !== 3
)
  throw new Error("Unexpected DRK training source data.");

// The work-pattern policy is structurally required but inert while all capabilities are blocked.
const existing = JSON.parse(
  readFileSync(resolve(root, "rules/packages/reviewed/drk-rtv-p/2024-06-01-draft1.json"), "utf8"),
);
const heuristic = existing.sources.find((item) => item.id === "pflegeshift-tariff-assessment-v1");
if (!heuristic) throw new Error("Missing source for the inert work-pattern policy.");
const official = {
  id: "drk-btg-rtv-52",
  title: source.source.title,
  url: source.source.url,
  documentDate: source.source.documentDate,
  section: `${source.source.section}; PDF-Seiten ${source.source.pdfPages.join(", ")}`,
  sha256: source.source.sha256,
};
const sourceIds = [official.id];
const variants = [
  ["ANLAGE_3", "Allgemeine Ausbildung", "anlage-3"],
  ["ANLAGE_3A_A", "Anlage 3a · Pflege und weitere genannte Ausbildungen", "anlage-3a"],
  ["ANLAGE_3A_B", "Anlage 3a · einjährige Pflegehilfe", "anlage-3a"],
].map(([id, label, specialPartId]) => ({
  id,
  label,
  specialPartId,
  sourceIds,
  regions: [
    {
      id: "BTG",
      label: "DRK-Bundestarifgemeinschaft",
      payTableId: "training",
      sourceIds,
    },
  ],
}));

for (const table of source.tables) {
  const entries = table.rows.flatMap(([groupId, ...values]) =>
    values.flatMap((monthlyCents, index) =>
      monthlyCents === null ? [] : [{ groupId, stepId: `s${index + 1}`, monthlyCents }],
    ),
  );
  const pkg = {
    schemaVersion: 1,
    engineContractVersion: 17,
    packageId: "drk-rtv-training",
    versionId: `${table.validFrom}-draft1`,
    kind: "TARIFF",
    label: "DRK-RTV · Anlagen 3/3a · Ausbildungsentgelt (nicht aktiviert)",
    status: "DRAFT",
    validFrom: table.validFrom,
    validTo: table.validTo,
    jurisdiction: { country: "DE", federalStates: null },
    sources: [official, heuristic],
    review: { status: "DRAFT", reviewedBy: null, reviewedAt: null, gitCommit: null },
    rounding: { moneyScale: 2, mode: "HALF_UP", stage: "PER_LINE" },
    rules: {
      selection: {
        familyId: "drk-rtv",
        engineId: "drk-rtv-training-v1",
        employmentKind: "APPRENTICE",
        variants,
        capabilities: {
          basePay: "UNSUPPORTED",
          timePremiums: "UNSUPPORTED",
          allowances: "UNSUPPORTED",
          overtime: "UNSUPPORTED",
          annualPayment: "UNSUPPORTED",
        },
      },
      selector: {
        agreementId: "drk-rtv",
        specialPartIds: ["anlage-3", "anlage-3a"],
        payTableId: "training",
      },
      payTables: [{ id: "training", entries, sourceIds }],
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      workPatternPolicy: existing.rules.workPatternPolicy,
    },
  };
  const validation = validateRulePackage(pkg);
  if (!validation.ok)
    throw new Error(`${pkg.versionId}: ${JSON.stringify(validation.issues, null, 2)}`);
  const target = resolve(root, `rules/packages/reviewed/drk-rtv-training/${pkg.versionId}.json`);
  mkdirSync(dirname(target), { recursive: true });
  const formatted = await prettier.format(JSON.stringify(pkg), {
    ...((await prettier.resolveConfig(target)) ?? {}),
    filepath: target,
  });
  writeFileSync(target, formatted);
  process.stdout.write(`Generated ${target}\n`);
}
