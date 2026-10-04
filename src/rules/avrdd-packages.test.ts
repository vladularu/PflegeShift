import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2025-03-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2026-09-01-draft1.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

const stages = ["entry", "base", "exp1", "exp2", "exp3"] as const;

function csv(annex: 2 | 9, stand: string): string[][] {
  return readFileSync(
    new URL(`../../docs/avrdd-anlage${annex}-${stand}.csv`, import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.split(","));
}

describe("AVR.DD dated DRAFT packages", () => {
  it.each([
    [
      "2025-03",
      oldCandidate,
      "2025-03-01",
      "2026-08-31",
      "6dbe45ec4234ea189da4635521ea2265d359c35666aec0ef2858a499f0561ad7",
    ],
    [
      "2026-09",
      currentCandidate,
      "2026-09-01",
      null,
      "9518d677c23229ee33301b44124e394f159382deebf4667ca88e6f1a32f1304c",
    ],
  ] as const)(
    "binds every Anlage 2/9 value for %s to its official document",
    (stand, candidate, start, end, sha256) => {
      const pkg = candidate as RuleTariffPackage;
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      expect(pkg.status).toBe("DRAFT");
      expect(pkg.validFrom).toBe(start);
      expect(pkg.validTo).toBe(end);
      expect(pkg.sources[0].sha256).toBe(sha256);
      const table = pkg.rules.payTables[0];
      const monthlyRows = csv(2, stand);
      const hourlyRows = csv(9, stand);
      expect(table.entries).toHaveLength(53);
      expect(pkg.rules.avrddHourlyRates).toHaveLength(13);
      expect(pkg.rules.avrddTimePremiumPolicy).toMatchObject({
        nightWindow: { startMinute: 1260, endMinute: 360 },
        saturdayWindow: { startMinute: 780, endMinute: 1260 },
        competition: "HIGHEST_SUNDAY_HOLIDAY_SATURDAY",
        nightStacks: true,
      });
      expect(pkg.rules.avrddOvertimePolicy).toMatchObject({
        fullTimePlusThresholdMinutes: 1800,
        monthlyFactorThousandths: 4348,
      });
      expect(pkg.rules.avrddShiftAllowanceRates).toEqual(
        stand === "2025-03"
          ? [
              {
                validFrom: "2025-03-01",
                validTo: "2026-08-31",
                alternatingMonthlyCents: 15000,
                shiftMonthlyCents: 6000,
                sourceIds: [pkg.sources[0].id],
              },
            ]
          : [
              {
                validFrom: "2026-09-01",
                validTo: "2027-06-30",
                alternatingMonthlyCents: 20000,
                shiftMonthlyCents: 8000,
                sourceIds: [pkg.sources[0].id, pkg.sources[1].id],
              },
              {
                validFrom: "2027-07-01",
                validTo: null,
                alternatingMonthlyCents: 25000,
                shiftMonthlyCents: 10000,
                sourceIds: [pkg.sources[0].id, pkg.sources[1].id],
              },
            ],
      );
      expect(
        pkg.rules.avrddCareAllowanceRates?.map((rate) => [
          rate.validFrom,
          rate.validTo,
          rate.monthlyCents,
        ]),
      ).toEqual(
        stand === "2025-03"
          ? [
              ["2025-03-01", "2026-06-30", 8000],
              ["2026-07-01", "2026-08-31", 10000],
            ]
          : [["2026-09-01", null, 10000]],
      );
      expect(
        pkg.rules.avrddAdvancedAllowancePolicies?.map((policy) => [
          policy.validFrom,
          policy.validTo,
          policy.phase,
          policy.practiceMode,
          policy.practiceMonthlyCents,
          policy.eg8DifferenceBasisPoints,
          policy.intensiveMonthlyCents,
          policy.specialistMonthlyCents,
        ]),
      ).toEqual(
        stand === "2025-03"
          ? [
              [
                "2025-03-01",
                "2026-06-30",
                "LEGACY_EFG",
                "HALF_EG8_DIFFERENCE",
                null,
                5000,
                15000,
                10000,
              ],
              [
                "2026-07-01",
                "2026-08-31",
                "POST_2026_07_EFGH",
                "FIXED_MONTHLY",
                20000,
                5000,
                15000,
                10000,
              ],
            ]
          : [["2026-09-01", null, "POST_2026_07_EFGH", "FIXED_MONTHLY", 20000, 5000, 15000, 10000]],
      );
      for (const [index, row] of monthlyRows.entries()) {
        expect(row[0]).toBe(`eg${index + 1}`);
        const group = pkg.rules.avrddStagePolicy!.groups[index];
        expect(group.groupId).toBe(row[0]);
        for (const [stepIndex, stepId] of stages.entries()) {
          const cents = row[1 + stepIndex * 2];
          const entry = table.entries.find(
            (item) => item.groupId === row[0] && item.stepId === stepId,
          );
          const progression = group.stages.find((item) => item.stepId === stepId);
          if (cents === "") {
            expect(entry).toBeUndefined();
            expect(progression).toBeUndefined();
          } else {
            expect(entry?.monthlyCents).toBe(Number(cents));
            const months = stepIndex === 4 ? "" : row[2 + stepIndex * 2];
            expect(progression?.monthsToNext).toBe(months === "" ? null : Number(months));
          }
        }
        expect(hourlyRows[index][0]).toBe(row[0]);
        expect(pkg.rules.avrddHourlyRates?.[index]).toMatchObject({
          groupId: row[0],
          hourlyCents: Number(hourlyRows[index][1]),
          overtimeSupplementCents: Number(hourlyRows[index][2]),
          anlage8OvertimeTotalCents: Number(hourlyRows[index][3]),
          sundayOrHolidayCents: Number(hourlyRows[index][4]),
          holidayOnSundayCents: Number(hourlyRows[index][5]),
          nightCents: Number(hourlyRows[index][6]),
          saturdayCents: Number(hourlyRows[index][7]),
        });
        for (const amount of hourlyRows[index].slice(1))
          expect(Number.isSafeInteger(Number(amount)) && Number(amount) > 0).toBe(true);
      }
      const selected = resolveTariffSelection(pkg, "ANLAGE_1", "AVR_DD");
      expect(Object.values(selected?.capabilities ?? {})).toEqual(Array(5).fill("UNSUPPORTED"));
      expect(selected?.groups.find((group) => group.id === "eg1")?.levels).toEqual([
        "base",
        "exp1",
      ]);
      expect(selected?.groups.find((group) => group.id === "eg13")?.levels).toEqual([...stages]);
    },
  );

  it("keeps both packages out of the executable remote catalog", () => {
    expect([...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS] as number[]).not.toContain(15);
  });

  it("rejects a sourced premium window that no longer matches § 20a", () => {
    const pkg = structuredClone(currentCandidate) as RuleTariffPackage;
    pkg.rules.avrddTimePremiumPolicy!.saturdayWindow.startMinute = 720;
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toContain("AVRDD_PREMIUM_WINDOW");
  });
  it("rejects a gap in the dated § 20 allowance rates", () => {
    const pkg = structuredClone(currentCandidate) as RuleTariffPackage;
    pkg.rules.avrddShiftAllowanceRates![1]!.validFrom = "2027-08-01";
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toContain("AVRDD_SHIFT_RATE_PERIOD");
  });
  it("rejects a gap or unknown source in the dated § 14(2)(c) rates", () => {
    const pkg = structuredClone(oldCandidate) as RuleTariffPackage;
    pkg.rules.avrddCareAllowanceRates![1]!.validFrom = "2026-08-01";
    pkg.rules.avrddCareAllowanceRates![1]!.sourceIds.push("missing-source");
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toContain("AVRDD_CARE_RATE_PERIOD");
      expect(codes).toContain("UNKNOWN_SOURCE_ID");
    }
  });
  it("rejects a post-July § 14(2) phase disguised as the legacy rule", () => {
    const pkg = structuredClone(oldCandidate) as RuleTariffPackage;
    pkg.rules.avrddAdvancedAllowancePolicies![1]!.phase = "LEGACY_EFG";
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toContain("AVRDD_ADVANCED_ALLOWANCE_PHASE");
  });

  it("preserves separate published Anlage 9 amounts instead of deriving from Anlage 2", () => {
    const old = csv(9, "2025-03");
    const current = csv(9, "2026-09");
    expect(old[9]).toEqual(["eg10", "3297", "495", "3791", "1154", "1648", "824", "495"]);
    expect(current[1]).toEqual(["eg2", "1684", "505", "2190", "589", "842", "421", "253"]);
    expect(current[12]).toEqual(["eg13", "4591", "689", "5280", "1607", "2296", "1148", "689"]);
  });
});
