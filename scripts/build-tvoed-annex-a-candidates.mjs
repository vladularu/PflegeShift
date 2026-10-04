import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { validateRulePackage } from "../src/rules/validation.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existing = JSON.parse(
  readFileSync(resolve(root, "rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json"), "utf8"),
);
const heuristic = existing.sources.find(
  (source) => source.id === "pflegeshift-tariff-assessment-v1",
);
if (!heuristic) throw new Error("Missing inert historical work-pattern source.");
const careBooklet = existing.sources.find((item) => item.id === "vka-tvoed-care-2026");
if (!careBooklet) throw new Error("Missing VKA BT-B source.");

const source = {
  id: "vka-tvoed-annex-a-2025-2026",
  title: "VKA, TVöD Krankenhäuser einschließlich TVöD-AT und Anlage A",
  url: "https://vka.de/wp-content/uploads/2026/04/250406_TVoeD_Krankenhaeuser_TV-Aerzte-VKA.pdf",
  documentDate: "2025-04-06",
  section: "TVöD-AT §§ 7(5,7,8), 8(1), 24(3), 38(5), BT-K § 50(1), Anlage A S. 67–68",
  sha256: "00e831fefffb833b689c1355c58e87cf25bdd6c585ab4693f41a187604b0ef6e",
};
const careSource = {
  ...careBooklet,
  section: "TVöD-AT §§ 7(5,7,8), 8(1), 24(3), 38(5), BT-B § 49a(1), Anlage A S. 65–66",
};
const header =
  "group,stufe1_cents,stufe2_cents,stufe3_cents,stufe4_cents,stufe5_cents,stufe6_cents";
const groups = [
  "eg15",
  "eg14",
  "eg13",
  "eg12",
  "eg11",
  "eg10",
  "eg9c",
  "eg9b",
  "eg9a",
  "eg8",
  "eg7",
  "eg6",
  "eg5",
  "eg4",
  "eg3",
  "eg2",
  "eg1",
];

function sourceEntries(period) {
  const [actualHeader, ...rows] = readFileSync(
    resolve(root, `docs/tvoed-vka-anlage-a-${period}.csv`),
    "utf8",
  )
    .trim()
    .split(/\r?\n/u);
  if (actualHeader !== header || rows.length !== groups.length)
    throw new Error(`Unexpected Anlage A table shape for ${period}.`);
  return rows.flatMap((line, index) => {
    const [groupId, ...amounts] = line.split(",");
    if (
      groupId !== groups[index] ||
      amounts.length !== 6 ||
      (groupId === "eg1") !== (amounts[0] === "")
    )
      throw new Error(`Invalid Anlage A row ${index + 1} for ${period}.`);
    return amounts.flatMap((amount, stepIndex) => {
      if (amount === "") return [];
      if (!/^[0-9]+$/u.test(amount) || Number(amount) <= 0)
        throw new Error(`Invalid Anlage A amount ${groupId}/s${stepIndex + 1}.`);
      return [{ groupId, stepId: `s${stepIndex + 1}`, monthlyCents: Number(amount) }];
    });
  });
}

function candidate(period) {
  const old = period === "2025-04";
  const validFrom = old ? "2025-04-01" : "2026-05-01";
  const sourceIds = [source.id, careSource.id];
  return {
    schemaVersion: 1,
    engineContractVersion: 16,
    packageId: "tvoed-vka-anlage-a",
    versionId: `${validFrom}-draft1`,
    kind: "TARIFF",
    label: "TVöD-VKA Anlage A (EG) · BT-K/BT-B · Entgelttabelle (nicht aktiviert)",
    status: "DRAFT",
    validFrom,
    validTo: old ? "2026-04-30" : "2027-03-31",
    jurisdiction: { country: "DE", federalStates: null },
    sources: [source, careSource, heuristic],
    review: { status: "DRAFT", reviewedBy: null, reviewedAt: null, gitCommit: null },
    rounding: { moneyScale: 2, mode: "HALF_UP", stage: "PER_LINE" },
    rules: {
      selection: {
        familyId: "tvoed-vka-annex-a",
        engineId: "tvoed-annex-a-v1",
        employmentKind: "EMPLOYEE",
        variants: [
          {
            id: "BT_K",
            label: "Krankenhaus (BT-K)",
            specialPartId: "bt-k",
            sourceIds: [source.id],
            regions: [
              {
                id: "VKA",
                label: "VKA · Anlage A",
                payTableId: "anlage-a",
                sourceIds: [source.id],
              },
            ],
          },
          {
            id: "BT_B",
            label: "Pflege- und Betreuungseinrichtung (BT-B)",
            specialPartId: "bt-b",
            sourceIds: [careSource.id],
            regions: [
              {
                id: "VKA",
                label: "VKA · Anlage A",
                payTableId: "anlage-a",
                sourceIds: [careSource.id],
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
      selector: {
        agreementId: "tvoed-vka",
        specialPartIds: ["bt-k", "bt-b"],
        payTableId: "anlage-a",
      },
      payTables: [{ id: "anlage-a", entries: sourceEntries(period), sourceIds }],
      tvoedAnnexAOvertimePolicy: {
        validFrom,
        validTo: old ? "2026-04-30" : "2027-03-31",
        premiumReferenceStepId: "s3",
        workPayMaximumStepId: "s4",
        monthlyFactorThousandths: 4348,
        standardFullTimeWeeklyMinutes: 2340,
        rateBands: [
          {
            groupIds: ["eg1", "eg2", "eg3", "eg4", "eg5", "eg6", "eg7", "eg8", "eg9a", "eg9b"],
            premiumBasisPoints: 3000,
          },
          {
            groupIds: ["eg9c", "eg10", "eg11", "eg12", "eg13", "eg14", "eg15"],
            premiumBasisPoints: 1500,
          },
        ],
        requiresConfirmedClassification: true,
        requiresSeparateSettlement: true,
        sourceIds,
      },
      tvoedAnnexATimePremiumPolicy: {
        validFrom,
        validTo: old ? "2026-04-30" : "2027-03-31",
        referenceStepId: "s3",
        monthlyFactorThousandths: 4348,
        standardFullTimeWeeklyMinutes: 2340,
        nightWindow: { startMinute: 1260, endMinute: 360 },
        nightBasisPoints: 2000,
        sundayBasisPoints: 2500,
        holidayWithTimeOffBasisPoints: 3500,
        holidayWithoutTimeOffBasisPoints: 13500,
        preHolidayWindow: { startMinute: 360, endMinute: 0 },
        preHolidayMonthDays: ["12-24", "12-31"],
        preHolidayBasisPoints: 3500,
        saturdayWindow: { startMinute: 780, endMinute: 1260 },
        saturdayBasisPoints: 2000,
        saturdayShiftLegacyAngestellteOnly: true,
        competition: "HIGHEST_SUNDAY_HOLIDAY_PREHOLIDAY_SATURDAY",
        nightStacks: true,
        holidayWithoutTimeOffMaximumTotalBasisPoints: 23500,
        localAgreementMayIncrease: true,
        sourceIds,
      },
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      workPatternPolicy: { ...existing.rules.workPatternPolicy, sourceIds: [heuristic.id] },
    },
  };
}

for (const period of ["2025-04", "2026-05"]) {
  const pkg = candidate(period);
  const checked = validateRulePackage(pkg);
  if (!checked.ok) throw new Error(`${period}: ${JSON.stringify(checked.issues, null, 2)}`);
  const target = resolve(root, `rules/packages/reviewed/tvoed-vka-anlage-a/${pkg.versionId}.json`);
  const formatOptions = await prettier.resolveConfig(target);
  const formatted = await prettier.format(JSON.stringify(pkg), {
    ...formatOptions,
    parser: "json",
  });
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== formatted)
      throw new Error(`Anlage A candidate differs from its sources: ${target}`);
    process.stdout.write(`Checked ${target}\n`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, formatted, "utf8");
    process.stdout.write(`Generated ${target}\n`);
  }
}
