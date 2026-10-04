import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import prior from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

const stageNames = ["entry", "base", "exp1", "exp2", "exp3"] as const;

function fixture(stand: "2025-03" | "2026-09"): RuleTariffPackage {
  const rows = readFileSync(
    new URL(`../../docs/avrdd-anlage2-${stand}.csv`, import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.split(","));
  const sourceIds = [prior.sources[0].id];
  const stageCells = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, null],
  ] as const;
  const groups = rows.map((row) => ({
    groupId: row[0],
    stages: stageCells.flatMap(([centsIndex, monthsIndex], index) =>
      row[centsIndex]
        ? [
            {
              stepId: stageNames[index],
              monthsToNext:
                monthsIndex === null ? null : row[monthsIndex] ? Number(row[monthsIndex]) : null,
            },
          ]
        : [],
    ),
  }));
  const pkg = {
    ...structuredClone(prior),
    engineContractVersion: 15,
    packageId: "avr-dd-anlage-1",
    versionId: `${stand}-test`,
    label: "AVR.DD Anlage 1 – synthetischer Vertragsfixture",
    validFrom: stand === "2025-03" ? "2025-03-01" : "2026-09-01",
    validTo: stand === "2025-03" ? "2026-08-31" : null,
    rules: {
      selection: {
        familyId: "avr-dd",
        engineId: "avr-dd-v1",
        employmentKind: "EMPLOYEE",
        variants: [
          {
            id: "ANLAGE_1",
            label: "AVR.DD Anlage 1",
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
      payTables: [
        {
          id: "anlage-2",
          sourceIds,
          entries: rows.flatMap((row) =>
            stageCells.flatMap(([centsIndex], index) =>
              row[centsIndex]
                ? [
                    {
                      groupId: row[0],
                      stepId: stageNames[index],
                      monthlyCents: Number(row[centsIndex]),
                    },
                  ]
                : [],
            ),
          ),
        },
      ],
      avrddStagePolicy: {
        standardFullTimeWeeklyMinutes: 2340,
        individualFullTimeMaxWeeklyMinutes: 2520,
        groups,
        sourceIds,
      },
      avrddShiftAllowanceRates:
        stand === "2025-03"
          ? [
              {
                validFrom: "2025-03-01",
                validTo: "2026-08-31",
                alternatingMonthlyCents: 15000,
                shiftMonthlyCents: 6000,
                sourceIds,
              },
            ]
          : [
              {
                validFrom: "2026-09-01",
                validTo: null,
                alternatingMonthlyCents: 20000,
                shiftMonthlyCents: 8000,
                sourceIds,
              },
            ],
      avrddCareAllowanceRates:
        stand === "2025-03"
          ? [
              { validFrom: "2025-03-01", validTo: "2026-06-30", monthlyCents: 8000, sourceIds },
              { validFrom: "2026-07-01", validTo: "2026-08-31", monthlyCents: 10000, sourceIds },
            ]
          : [{ validFrom: "2026-09-01", validTo: null, monthlyCents: 10000, sourceIds }],
      avrddAdvancedAllowancePolicies:
        stand === "2025-03"
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
                sourceIds,
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
                sourceIds,
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
                sourceIds,
              },
            ],
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      workPatternPolicy: structuredClone(prior.rules.workPatternPolicy),
    },
  } as RuleTariffPackage;
  return pkg;
}

function rejects(change: (pkg: RuleTariffPackage) => void, code: string): void {
  const pkg = fixture("2026-09");
  change(pkg);
  const result = validateRulePackage(pkg);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.map((item) => item.code)).toContain(code);
}

describe("AVR.DD draft table contract", () => {
  it.each(["2025-03", "2026-09"] as const)(
    "accepts %s group-dependent source table without enabling calculation",
    (stand) => {
      const pkg = fixture(stand);
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      const selection = resolveTariffSelection(pkg, "ANLAGE_1", "AVR_DD");
      expect(selection?.capabilities.basePay).toBe("UNSUPPORTED");
      expect(selection?.groups.find((group) => group.id === "eg1")?.levels).toEqual([
        "base",
        "exp1",
      ]);
      expect(selection?.groups.find((group) => group.id === "eg4")?.levels).toEqual([
        "entry",
        "base",
        "exp1",
      ]);
      expect(selection?.groups.find((group) => group.id === "eg13")?.levels).toEqual([
        ...stageNames,
      ]);
    },
  );
  it("does not activate contract 15 in the remote resolver", () => {
    expect([...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS] as number[]).not.toContain(15);
  });
  it("rejects an absent actual EG stage", () =>
    rejects((pkg) => {
      pkg.rules.payTables[0].entries.pop();
    }, "AVRDD_TABLE_INCOMPLETE"));
  it("rejects fabricated EG stages", () =>
    rejects((pkg) => {
      pkg.rules.payTables[0].entries.push({ groupId: "eg1", stepId: "entry", monthlyCents: 1 });
    }, "AVRDD_TABLE_ENTRY"));
  it("rejects a stage progression without terminal stop", () =>
    rejects((pkg) => {
      pkg.rules.avrddStagePolicy!.groups[0].stages.at(-1)!.monthsToNext = 24;
    }, "AVRDD_STAGE_SEQUENCE"));
  it("requires an independent complete Anlage 9 table if hourly rates are present", () =>
    rejects((pkg) => {
      const rates = Array.from({ length: 13 }, (_, index) => ({
        groupId: index === 12 ? "eg12" : `eg${index + 1}`,
        hourlyCents: 2_000,
        overtimeSupplementCents: 500,
        anlage8OvertimeTotalCents: 2_500,
        sundayOrHolidayCents: 700,
        holidayOnSundayCents: 1_000,
        nightCents: 500,
        saturdayCents: 300,
        sourceIds: [pkg.sources[0].id],
      }));
      expect(rates).toHaveLength(13);
      pkg.rules.avrddHourlyRates = rates as unknown as NonNullable<
        RuleTariffPackage["rules"]["avrddHourlyRates"]
      >;
    }, "AVRDD_HOURLY_GROUP"));
  it("rejects accidental support claims", () =>
    rejects((pkg) => {
      pkg.rules.selection!.capabilities.basePay = "SUPPORTED";
    }, "AVRDD_NOT_EXECUTABLE"));
  it("rejects AVR.DD identity under a foreign contract", () =>
    rejects((pkg) => {
      pkg.engineContractVersion = 14;
    }, "AVRDD_CONTRACT"));
});
