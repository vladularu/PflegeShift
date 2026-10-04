import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

function candidate(): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

// Synthetic contract fixture only; the candidate itself does not claim sourced premium support.
function withPolicy(): RuleTariffPackage {
  const pkg = candidate();
  pkg.rules.caritasTimePremiumPolicy = {
    validFrom: "2026-02-01",
    validTo: "2026-12-31",
    referenceStepId: "3",
    monthlyFactorThousandths: 4348,
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
    saturdayOnlyOutsideShiftWork: true,
    competition: "HIGHEST_SUNDAY_HOLIDAY_PREHOLIDAY_SATURDAY",
    nightStacks: true,
    holidayWithoutTimeOffMaximumTotalBasisPoints: 23500,
    localAgreementMayIncrease: true,
    sourceIds: [pkg.sources[0].id],
  };
  return pkg;
}

function codes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("Caritas § 4/§ 6 baseline time-premium contract", () => {
  it("accepts a complete baseline but keeps calculation unsupported", () => {
    const pkg = withPolicy();
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg.rules.selection?.capabilities.timePremiums).toBe("UNSUPPORTED");
    expect(pkg.status).toBe("DRAFT");
  });

  it("rejects a changed night window, premium rate or December dates", () => {
    const night = withPolicy();
    night.rules.caritasTimePremiumPolicy!.nightWindow.startMinute = 1200;
    expect(codes(night)).toContain("CARITAS_TIME_PREMIUM_VALUE");

    const sunday = withPolicy();
    sunday.rules.caritasTimePremiumPolicy!.sundayBasisPoints = 2000;
    expect(codes(sunday)).toContain("CARITAS_TIME_PREMIUM_VALUE");

    const days = withPolicy();
    days.rules.caritasTimePremiumPolicy!.preHolidayMonthDays = ["12-24", "12-24"];
    expect(validateRulePackage(days).ok).toBe(false);
  });

  it("rejects unknown evidence and use outside contract 14", () => {
    const source = withPolicy();
    source.rules.caritasTimePremiumPolicy!.sourceIds = ["not-in-package"];
    expect(codes(source)).toContain("UNKNOWN_SOURCE_ID");

    const contract = withPolicy();
    contract.engineContractVersion = 12;
    expect(codes(contract)).toContain("CARITAS_TIME_PREMIUM_CONTRACT");
  });

  it("rejects dates outside the regional package", () => {
    const pkg = withPolicy();
    pkg.rules.caritasTimePremiumPolicy!.validFrom = "2025-07-01";
    expect(codes(pkg)).toContain("CARITAS_TIME_PREMIUM_RANGE");
  });
});
