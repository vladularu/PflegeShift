import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { resolveTariffSelection } from "./tariff-selection";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";

// Independently transcribed from TVA-L Pflege § 8, ÄTV 13; cents, not TVöD-derived.
const reference = [
  ["2025-11", "2025-11-01", "2026-03-31", [138070, 144670, 155300], []],
  ["2026-04", "2026-04-01", "2026-12-31", [144070, 150670, 161300], []],
  ["2027-01", "2027-01-01", "2027-02-28", [144070, 150670, 161300], [129682, 135096]],
  ["2027-03", "2027-03-01", "2027-12-31", [150070, 156670, 167300], [135682, 141096]],
  ["2028-01", "2028-01-01", null, [153070, 159670, 170300], [138682, 144096]],
] as const;

function candidate(version = "2027-01"): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(`../../rules/packages/reviewed/tval-pflege-tdl/${version}.json`, import.meta.url),
      "utf8",
    ),
  );
}
function rejects(pkg: RuleTariffPackage, code: string) {
  const result = validateRulePackage(pkg);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain(code);
}

describe("TVA-L Pflege source tables and shared contract", () => {
  it.each(reference)(
    "%s has every official amount and its exact period",
    (version, from, to, regular, assistant) => {
      const pkg = candidate(version);
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      expect([pkg.validFrom, pkg.validTo]).toEqual([from, to]);
      const entries = pkg.rules.payTables[0]!.entries;
      expect(entries).toHaveLength(regular.length + assistant.length);
      for (const [group, amounts] of [
        ["regular", regular],
        ["assistant", assistant],
      ] as const) {
        const actual = entries
          .filter((e) => e.groupId === group)
          .sort((a, b) => Number(a.stepId) - Number(b.stepId));
        expect(actual.map((e) => e.monthlyCents)).toEqual(amounts);
        expect(actual.map((e) => e.stepId)).toEqual(amounts.map((_, i) => String(i + 1)));
      }
      expect(resolveTariffSelection(pkg, "CARE", "WEST_38_5")?.familyId).toBe("tval-pflege");
      expect(pkg.status).toBe("DRAFT");
      expect(pkg.review.reviewedBy).toBeNull();
      expect(pkg.sources.find((s) => s.id === "tdl-tval-pflege-2026")?.sha256).toBe(
        "0d6e0db4974150534f96cc5745a93330c8b4f6524629753cb09607e4e80eb1c4",
      );
    },
  );
  it("does not advertise unfinished supplements or activate the engine remotely", () => {
    expect([...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS]).not.toContain(13);
    expect(candidate().rules.selection?.capabilities).toEqual({
      basePay: "SUPPORTED",
      timePremiums: "SUPPORTED",
      allowances: "UNSUPPORTED",
      overtime: "SUPPORTED",
      annualPayment: "SUPPORTED",
    });
  });
  it.each([
    ["2026-04", "2026-12-31", 2400],
    ["2027-01", "2027-01-01", 2370],
    ["2027-03", "2027-12-31", 2370],
    ["2028-01", "2028-01-01", 2340],
    ["2028-01", "2029-01-01", 2310],
  ])("%s resolves East university training hours on %s", (version, date, minutes) => {
    const rules = candidate(String(version)).rules.employmentWorkingTimeRules!;
    const matching = rules.filter(
      (r) =>
        r.regionId === "EAST_UNIVERSITY_HOSPITAL" &&
        r.validFrom <= String(date) &&
        (r.validTo === null || r.validTo >= String(date)),
    );
    expect(matching).toHaveLength(1);
    expect(matching[0]!.fullTimeWeeklyMinutes).toBe(minutes);
    expect(rules.find((r) => r.regionId === "WEST_38_5")!.fullTimeWeeklyMinutes).toBe(2310);
    expect(rules.find((r) => r.regionId === "EAST")!.fullTimeWeeklyMinutes).toBe(2400);
  });
  it("distinguishes training years from assistant month brackets", () => {
    expect(
      candidate().rules.tvalTrainingPay?.categories.map((c) => [
        c.groupId,
        c.periodKind,
        c.levels.length,
      ]),
    ).toEqual([
      ["regular", "TRAINING_YEAR", 3],
      ["assistant", "TRAINING_MONTH_BRACKET", 2],
    ]);
    const pkg = candidate();
    pkg.rules.tvalTrainingPay!.categories[1]!.periodKind = "TRAINING_YEAR";
    rejects(pkg, "TVAL_LEVELS");
  });
  it("rejects early assistant coverage and periods crossing the introduction", () => {
    const pkg = candidate();
    pkg.validFrom = "2026-12-01";
    rejects(pkg, "TVAL_CATEGORIES");
    rejects(pkg, "TVAL_CATEGORY_BOUNDARY");
  });
  it("rejects missing and duplicate amounts", () => {
    const pkg = candidate();
    pkg.rules.payTables[0]!.entries.pop();
    rejects(pkg, "TVAL_TABLE_INCOMPLETE");
    pkg.rules.payTables[0]!.entries.push(pkg.rules.payTables[0]!.entries[0]!);
    rejects(pkg, "TVAL_TABLE_CELL");
  });
  it("rejects wrong tariff identities and fabricated capabilities", () => {
    const pkg = candidate();
    pkg.rules.selection!.familyId = "tvaoed-pflege";
    rejects(pkg, "TVAL_IDENTITY");
    pkg.rules.selection!.capabilities.annualPayment = "UNSUPPORTED";
    rejects(pkg, "TVAL_COMPONENT_COVERAGE");
  });
  it("rejects missing sources and holes or duplicate days in full-time coverage", () => {
    const pkg = candidate();
    pkg.rules.tvalTrainingPay!.sourceIds = ["missing"];
    rejects(pkg, "UNKNOWN_SOURCE_ID");
    pkg.rules.employmentWorkingTimeRules![0]!.validFrom = "2027-01-02";
    rejects(pkg, "TVAL_WORKING_TIME_COVERAGE");
    pkg.rules.employmentWorkingTimeRules!.push(pkg.rules.employmentWorkingTimeRules![1]!);
    rejects(pkg, "TVAL_WORKING_TIME_IDENTITY");
  });
});
