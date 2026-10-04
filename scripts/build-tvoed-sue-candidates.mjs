import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { validateRulePackage } from "../src/rules/validation.ts";
import { readTvoedSueBtBSource } from "./tvoed-sue-source.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reference = JSON.parse(
  readFileSync(resolve(root, "rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json"), "utf8"),
);
const historicalHeuristic = reference.sources.find(
  (source) => source.id === "pflegeshift-tariff-assessment-v1",
);
const btB = reference.sources.find((source) => source.id === "vka-tvoed-care-2026");
if (!historicalHeuristic || !btB) throw new Error("Missing inert VKA source metadata.");
const source = {
  ...btB,
  id: "vka-tvoed-sue-bt-b-2025-2026",
  section: "BT-B Anlage C, Tabellen S 2–S 18, Druckseiten 94–95 (2025/26 und ab 01.05.2026)",
};

function candidate(period) {
  const old = period === "2025-04";
  const validFrom = old ? "2025-04-01" : "2026-05-01";
  return {
    schemaVersion: 1,
    engineContractVersion: 18,
    packageId: "tvoed-vka-sue-bt-b",
    versionId: `${validFrom}-draft1`,
    kind: "TARIFF",
    label: "TVöD-VKA Sozial- und Erziehungsdienst · BT-B · Anlage C (nicht aktiviert)",
    status: "DRAFT",
    validFrom,
    // Conservative product boundary, not a claim that the printed table ends on this date.
    validTo: old ? "2026-04-30" : "2027-03-31",
    jurisdiction: { country: "DE", federalStates: null },
    sources: [source, historicalHeuristic],
    review: { status: "DRAFT", reviewedBy: null, reviewedAt: null, gitCommit: null },
    rounding: { moneyScale: 2, mode: "HALF_UP", stage: "PER_LINE" },
    rules: {
      selection: {
        familyId: "tvoed-vka-sue",
        engineId: "tvoed-sue-bt-b-table-draft-v1",
        employmentKind: "EMPLOYEE",
        variants: [
          {
            id: "BT_B",
            label: "Pflege- und Betreuungseinrichtung (BT-B)",
            specialPartId: "bt-b",
            sourceIds: [source.id],
            regions: [
              {
                id: "VKA",
                label: "VKA · Anlage C",
                payTableId: "anlage-c",
                sourceIds: [source.id],
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
      selector: { agreementId: "tvoed-vka", specialPartId: "bt-b", payTableId: "anlage-c" },
      payTables: [
        {
          id: "anlage-c",
          entries: readTvoedSueBtBSource(period, root),
          sourceIds: [source.id],
        },
      ],
      premiumRules: [],
      allowanceRules: [],
      tvoedSueAllowancePolicy: {
        bands: [
          {
            groupIds: ["s2", "s3", "s4", "s7", "s8a", "s8b", "s9", "s11a"],
            monthlyCents: 13000,
            caseGroup: null,
          },
          {
            groupIds: ["s11b", "s12", "s14"],
            monthlyCents: 18000,
            caseGroup: null,
          },
          {
            groupIds: ["s15"],
            monthlyCents: 18000,
            caseGroup: "6",
          },
        ],
        partTimeProRata: true,
        conversionDaysRequireSeparateCalculation: true,
        sourceIds: ["vka-tvoed-sue-bt-b-2025-2026"],
      },
      combinationRules: [],
      workPatternRules: [],
      workPatternPolicy: {
        ...reference.rules.workPatternPolicy,
        sourceIds: [historicalHeuristic.id],
      },
    },
  };
}

for (const period of ["2025-04", "2026-05"]) {
  const pkg = candidate(period);
  const checked = validateRulePackage(pkg);
  if (!checked.ok) throw new Error(`${period}: ${JSON.stringify(checked.issues, null, 2)}`);
  const target = resolve(root, `rules/packages/reviewed/tvoed-vka-sue-bt-b/${pkg.versionId}.json`);
  const options = await prettier.resolveConfig(target);
  const policy = pkg.rules.tvoedSueAllowancePolicy;
  const serialized = JSON.stringify(pkg).replace(
    `"tvoedSueAllowancePolicy":${JSON.stringify(policy)}`,
    `"tvoedSueAllowancePolicy":${JSON.stringify(policy, null, 2)}`,
  );
  const formatted = await prettier.format(serialized, { ...options, parser: "json" });
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== formatted)
      throw new Error(`SuE candidate differs from its sources: ${target}`);
    process.stdout.write(`Checked ${target}\n`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, formatted, "utf8");
    process.stdout.write(`Generated ${target}\n`);
  }
}
