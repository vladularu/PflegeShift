import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { validateRulePackage } from "../src/rules/validation.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const legacyHeuristicPackage = JSON.parse(
  readFileSync(
    resolve(root, "rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json"),
    "utf8",
  ),
);
const heuristic = legacyHeuristicPackage.sources.find(
  (source) => source.id === "pflegeshift-tariff-assessment-v1",
);
if (!heuristic) throw new Error("Missing source for the inert legacy work-pattern policy.");

const ANLAGE_2_HEADER =
  "group,entry_cents,entry_months,base_cents,base_months,exp1_cents,exp1_months,exp2_cents,exp2_months,exp3_cents";
const ANLAGE_9_HEADER =
  "group,hourly_cents,overtime_supplement_cents,anlage8_overtime_total_cents,sunday_holiday_cents,sunday_holiday_combined_cents,night_cents,saturday_cents";
const stages = ["entry", "base", "exp1", "exp2", "exp3"];
const avrddText = {
  id: "arkdd-avrdd-2026-01",
  title: "Arbeitsrechtliche Kommission Diakonie Deutschland, AVR.DD Stand 01.01.2026",
  url: "https://www.arkdd.de/avr/avrdd_20260101.pdf",
  documentDate: "2026-01-01",
  section: "§§ 9, 14, 15, 20, 21, Anlage 2 (S. 129) und Anlage 9 (S. 172); Tabellen ab 01.03.2025",
  sha256: "6dbe45ec4234ea189da4635521ea2265d359c35666aec0ef2858a499f0561ad7",
};
const circular2025 = {
  id: "arkdd-rundschreiben-2025-07",
  title: "Arbeitsrechtliche Kommission Diakonie Deutschland, Rundschreiben 11.07.2025",
  url: "https://www.arkdd.de/rs/rs_20250711.pdf",
  documentDate: "2025-07-11",
  section:
    "§ 14 Abs. 2 Buchst. c ab 01.07.2026; § 20 ab 01.09.2026/01.07.2027; Tabellen ab 01.09.2026",
  sha256: "9518d677c23229ee33301b44124e394f159382deebf4667ca88e6f1a32f1304c",
};

function csvRows(name, expectedHeader) {
  const [header, ...lines] = readFileSync(resolve(root, `docs/${name}`), "utf8")
    .trim()
    .split(/\r?\n/u);
  if (header !== expectedHeader || lines.length !== 13)
    throw new Error(`Unexpected AVR.DD table shape: ${name}`);
  return lines.map((line, index) => {
    const fields = line.split(",");
    if (fields[0] !== `eg${index + 1}`) throw new Error(`Unexpected EG order in ${name}`);
    return fields;
  });
}

function candidate(stand) {
  const old = stand === "2025-03";
  const validFrom = old ? "2025-03-01" : "2026-09-01";
  const source = old ? avrddText : circular2025;
  const sourceIds = [source.id];
  const ruleSourceIds = old ? sourceIds : [source.id, avrddText.id];
  const monthlyRows = csvRows(`avrdd-anlage2-${stand}.csv`, ANLAGE_2_HEADER);
  const hourlyRows = csvRows(`avrdd-anlage9-${stand}.csv`, ANLAGE_9_HEADER);
  const groups = monthlyRows.map((fields, index) => ({
    groupId: `eg${index + 1}`,
    stages: stages.flatMap((stepId, stepIndex) => {
      const cents = fields[1 + stepIndex * 2];
      if (cents === "") return [];
      const months = stepIndex === 4 ? "" : fields[2 + stepIndex * 2];
      return [{ stepId, monthsToNext: months === "" ? null : Number(months) }];
    }),
  }));
  const entries = monthlyRows.flatMap((fields, index) =>
    stages.flatMap((stepId, stepIndex) => {
      const cents = fields[1 + stepIndex * 2];
      return cents === ""
        ? []
        : [{ groupId: `eg${index + 1}`, stepId, monthlyCents: Number(cents) }];
    }),
  );
  return {
    schemaVersion: 1,
    engineContractVersion: 15,
    packageId: "avr-dd-anlage-1",
    versionId: `${validFrom}-draft1`,
    kind: "TARIFF",
    label: "AVR.DD · Anlage 1/2 · Entgelttabelle (nicht aktiviert)",
    status: "DRAFT",
    validFrom,
    validTo: old ? "2026-08-31" : null,
    jurisdiction: { country: "DE", federalStates: null },
    sources: old ? [source, circular2025, heuristic] : [source, avrddText, heuristic],
    review: { status: "DRAFT", reviewedBy: null, reviewedAt: null, gitCommit: null },
    rounding: { moneyScale: 2, mode: "HALF_UP", stage: "PER_LINE" },
    rules: {
      selection: {
        familyId: "avr-dd",
        engineId: "avr-dd-v1",
        employmentKind: "EMPLOYEE",
        variants: [
          {
            id: "ANLAGE_1",
            label: "Anlage 1",
            specialPartId: "anlage-1",
            sourceIds,
            regions: [{ id: "AVR_DD", label: "AVR.DD", payTableId: "anlage-2", sourceIds }],
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
      selector: { agreementId: "avr-dd", specialPartId: "anlage-1", payTableId: "anlage-2" },
      payTables: [{ id: "anlage-2", entries, sourceIds }],
      avrddStagePolicy: {
        standardFullTimeWeeklyMinutes: 2340,
        individualFullTimeMaxWeeklyMinutes: 2520,
        groups,
        sourceIds: ruleSourceIds,
      },
      avrddHourlyRates: hourlyRows.map((fields, index) => ({
        groupId: `eg${index + 1}`,
        hourlyCents: Number(fields[1]),
        overtimeSupplementCents: Number(fields[2]),
        anlage8OvertimeTotalCents: Number(fields[3]),
        sundayOrHolidayCents: Number(fields[4]),
        holidayOnSundayCents: Number(fields[5]),
        nightCents: Number(fields[6]),
        saturdayCents: Number(fields[7]),
        sourceIds,
      })),
      avrddTimePremiumPolicy: {
        nightWindow: { startMinute: 1260, endMinute: 360 },
        saturdayWindow: { startMinute: 780, endMinute: 1260 },
        competition: "HIGHEST_SUNDAY_HOLIDAY_SATURDAY",
        nightStacks: true,
        sourceIds: ruleSourceIds,
      },
      avrddOvertimePolicy: {
        fullTimePlusThresholdMinutes: 1800,
        monthlyFactorThousandths: 4348,
        sourceIds: ruleSourceIds,
      },
      avrddShiftAllowanceRates: old
        ? [
            {
              validFrom: "2025-03-01",
              validTo: "2026-08-31",
              alternatingMonthlyCents: 15000,
              shiftMonthlyCents: 6000,
              sourceIds: [avrddText.id],
            },
          ]
        : [
            {
              validFrom: "2026-09-01",
              validTo: "2027-06-30",
              alternatingMonthlyCents: 20000,
              shiftMonthlyCents: 8000,
              sourceIds: [source.id, avrddText.id],
            },
            {
              validFrom: "2027-07-01",
              validTo: null,
              alternatingMonthlyCents: 25000,
              shiftMonthlyCents: 10000,
              sourceIds: [source.id, avrddText.id],
            },
          ],
      avrddCareAllowanceRates: old
        ? [
            {
              validFrom: "2025-03-01",
              validTo: "2026-06-30",
              monthlyCents: 8000,
              sourceIds: [avrddText.id],
            },
            {
              validFrom: "2026-07-01",
              validTo: "2026-08-31",
              monthlyCents: 10000,
              sourceIds: [source.id, circular2025.id],
            },
          ]
        : [
            {
              validFrom: "2026-09-01",
              validTo: null,
              monthlyCents: 10000,
              sourceIds: [source.id, avrddText.id],
            },
          ],
      avrddAdvancedAllowancePolicies: old
        ? [
            {
              validFrom: "2025-03-01",
              validTo: "2026-06-30",
              phase: "LEGACY_EFG",
              practiceMode: "HALF_EG8_DIFFERENCE",
              practiceMonthlyCents: null,
              eg8DifferenceBasisPoints: 5000,
              intensiveMonthlyCents: 15000,
              specialistMonthlyCents: 10000,
              sourceIds: [avrddText.id],
            },
            {
              validFrom: "2026-07-01",
              validTo: "2026-08-31",
              phase: "POST_2026_07_EFGH",
              practiceMode: "FIXED_MONTHLY",
              practiceMonthlyCents: 20000,
              eg8DifferenceBasisPoints: 5000,
              intensiveMonthlyCents: 15000,
              specialistMonthlyCents: 10000,
              sourceIds: [avrddText.id, circular2025.id],
            },
          ]
        : [
            {
              validFrom: "2026-09-01",
              validTo: null,
              phase: "POST_2026_07_EFGH",
              practiceMode: "FIXED_MONTHLY",
              practiceMonthlyCents: 20000,
              eg8DifferenceBasisPoints: 5000,
              intensiveMonthlyCents: 15000,
              specialistMonthlyCents: 10000,
              sourceIds: [source.id, avrddText.id],
            },
          ],
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      workPatternPolicy: legacyHeuristicPackage.rules.workPatternPolicy,
    },
  };
}

for (const stand of ["2025-03", "2026-09"]) {
  const pkg = candidate(stand);
  const validation = validateRulePackage(pkg);
  if (!validation.ok) throw new Error(`${stand}: ${JSON.stringify(validation.issues, null, 2)}`);
  const target = resolve(root, `rules/packages/reviewed/avr-dd-anlage-1/${pkg.versionId}.json`);
  const formatted = await prettier.format(JSON.stringify(pkg), {
    ...((await prettier.resolveConfig(target)) ?? {}),
    filepath: target,
  });
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== formatted)
      throw new Error(`AVR.DD candidate differs from its sources: ${target}`);
    process.stdout.write(`Checked ${target}\n`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, formatted);
    process.stdout.write(`Generated ${target}\n`);
  }
}
