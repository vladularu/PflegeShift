import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2025-04.json";
import newValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import type {
  DatedRemunerationProfile,
  TrainingSpecialDutyAllowance,
} from "@/domain/remuneration-profile";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";
import type { AllowanceStatus } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { calculateMonthlyDatedAllowances } from "./remuneration-allowances";
import { deriveDatedAllowanceAssessments } from "./remuneration-assessment";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

const catalog = resolver([oldValue, newValue] as RuleTariffPackage[]);
function training(
  weeklyMinutes = 2310,
  variant = "BT_K",
  region = "OTHER",
): DatedRemunerationProfile {
  return {
    ...history("2025-04-01"),
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tvaoed-pflege-vka",
        group: "b",
        level: "1",
        variant,
        region,
        fullTimeWeeklyMinutes: variant === "BT_K" ? 2310 : 2340,
      },
    },
  };
}
const entitlement = (status: AllowanceStatus, month = "2026-09"): DatedAllowanceEntitlement => ({
  from: month + "-01",
  through: month + "-30",
  status,
  origin: "confirmed",
  revision: 1,
});
const run = (status: AllowanceStatus, profile = training()) =>
  calculateMonthlyDatedAllowances(
    "2026-09",
    [shift()],
    work,
    [profile],
    [entitlement(status)],
    catalog,
  );
const shiftLine = (result: ReturnType<typeof run>) =>
  result.positions.find(
    (p) => p.basis.allowanceType === "shift" || p.basis.allowanceType === "alternating-shift",
  )!;

describe("TVAöD-Pflege shift allowances", () => {
  const special = (
    value: TrainingSpecialDutyAllowance | null,
    weekly = 2310,
  ): DatedRemunerationProfile => {
    const previous = training(weekly);
    if (previous.data.selection.kind !== "tariff") throw new Error("test profile");
    return {
      ...previous,
      data: {
        ...previous.data,
        version: 3,
        selection: { ...previous.data.selection, specialDutyAllowance: value },
      },
    };
  };
  it.each([
    ["PE1_ONLY", 2310, 2301, true],
    ["PE1_ONLY", 1155, 1151, true],
    ["NONE", 2310, 0, true],
    [null, 2310, null, false],
    ["OTHER_OR_MULTIPLE", 2310, null, false],
  ] as const)(
    "calculates confirmed special eligibility %s at %i minutes",
    (value, weekly, cents, complete) => {
      const result = run("NONE", special(value, weekly));
      expect(result.positions.find((p) => p.basis.allowanceType === "care")?.amountCents).toBe(
        cents,
      );
      expect(result.complete).toBe(complete);
      expect(result.totalCents).toBe(cents);
    },
  );
  it("takes the special-duty amount from the catalog and not from personal or app constants", () => {
    const changed = structuredClone(newValue) as RuleTariffPackage;
    changed.rules.allowanceRules.find(
      (rule) => rule.id === "training-special-duty-pe1",
    )!.amountCents = 4000;
    const result = calculateMonthlyDatedAllowances(
      "2026-09",
      [],
      work,
      [special("PE1_ONLY")],
      [entitlement("NONE")],
      resolver([changed]),
    );
    expect(result.totalCents).toBe(4000);
  });
  it("splits special-duty eligibility on the effective date without rewriting old months", () => {
    const profiles = [special("NONE"), { ...special("PE1_ONLY"), effectiveFrom: "2026-09-16" }];
    const result = calculateMonthlyDatedAllowances(
      "2026-09",
      [],
      work,
      profiles,
      [entitlement("NONE")],
      catalog,
    );
    expect(result.totalCents).toBe(1151);
    const care = result.positions.filter((p) => p.basis.allowanceType === "care");
    expect(care.map((p) => [p.from, p.through, p.amountCents])).toEqual([
      ["2026-09-01", "2026-09-15", 0],
      ["2026-09-16", "2026-09-30", 1151],
    ]);
    expect(care[1].status).toBe("estimated");
    const august = calculateMonthlyDatedAllowances(
      "2026-08",
      [],
      work,
      profiles,
      [{ ...entitlement("NONE", "2026-08"), through: "2026-08-31" }],
      catalog,
    );
    expect(august.totalCents).toBe(0);
  });
  it("does not replace a missing or duplicated special-duty rule with an employee allowance", () => {
    for (const duplicate of [false, true]) {
      const changed = structuredClone(newValue) as RuleTariffPackage;
      const rule = changed.rules.allowanceRules.find((r) => r.id === "training-special-duty-pe1")!;
      changed.rules.allowanceRules = changed.rules.allowanceRules.filter((r) => r !== rule);
      if (duplicate) changed.rules.allowanceRules.push(rule, { ...rule });
      const result = calculateMonthlyDatedAllowances(
        "2026-09",
        [],
        work,
        [special("PE1_ONLY")],
        [entitlement("NONE")],
        resolver([changed]),
      );
      expect(result.complete).toBe(false);
      expect(result.totalCents).toBeNull();
    }
  });
  // Independent reference: §8b 75% of 100 / 250 EUR, not the employee allowance.
  it.each([
    ["SHIFT_MONTHLY", 7500],
    ["ALTERNATING_MONTHLY", 18750],
    ["SHIFT_HOURLY", 90], // 2h × round(0.60 × 75%) = 0.90 EUR.
    ["ALTERNATING_HOURLY", 224], // 2h × round(1.49 × 75%) = 2.24 EUR.
    ["NONE", 0],
  ] as const)("calculates %s without importing employee care allowances", (status, cents) => {
    const result = run(status);
    expect(shiftLine(result)).toMatchObject({ amountCents: cents, status: "calculated" });
    expect(result.positions.some((p) => p.basis.allowanceType === "tvoed")).toBe(false);
    expect(result.knownSubtotalCents).toBe(cents);
    // Special-duty entitlement is deliberately not guessed as zero.
    expect(result).toMatchObject({ complete: false, totalCents: null });
    expect(result.positions.find((p) => p.basis.allowanceType === "care")).toMatchObject({
      amountCents: null,
      label: "Tätigkeitsabhängige Ausbildungszulage",
    });
  });
  it.each([
    ["SHIFT_MONTHLY", 3750],
    ["ALTERNATING_MONTHLY", 9375],
    ["SHIFT_HOURLY", 90],
    ["ALTERNATING_HOURLY", 224],
  ] as const)("prorates monthly but not worked-hour %s twice", (status, cents) => {
    expect(shiftLine(run(status, training(1155))).amountCents).toBe(cents);
  });
  it.each([
    ["BT_K", "KAV_BW", "SHIFT_HOURLY", 88],
    ["BT_K", "KAV_BW", "ALTERNATING_HOURLY", 220],
    ["BT_B", "OTHER", "SHIFT_HOURLY", 88],
    ["BT_B", "OTHER", "ALTERNATING_HOURLY", 220],
  ] as const)(
    "uses selected %s/%s %s, not the legacy work profile",
    (variant, region, status, cents) => {
      expect(
        shiftLine(run(status, training(variant === "BT_K" ? 2310 : 2340, variant, region)))
          .amountCents,
      ).toBe(cents);
    },
  );
  it("does not invent an entitlement when its confirmation or estimate is absent", () => {
    const result = calculateMonthlyDatedAllowances("2026-09", [], work, [training()], [], catalog);
    expect(shiftLine(result).issue?.code).toBe("ALLOWANCE_DECISION_MISSING");
    expect(shiftLine(result).amountCents).toBeNull();
  });
  it("preserves estimated entitlement and pause uncertainty", () => {
    const estimated = { ...entitlement("SHIFT_MONTHLY"), origin: "estimated" as const };
    expect(
      shiftLine(
        calculateMonthlyDatedAllowances("2026-09", [], work, [training()], [estimated], catalog),
      ),
    ).toMatchObject({ amountCents: 7500, status: "estimated" });
    const paused = calculateMonthlyDatedAllowances(
      "2026-09",
      [shift({ breakMinutes: 30 })],
      work,
      [training()],
      [entitlement("ALTERNATING_HOURLY")],
      catalog,
    );
    expect(shiftLine(paused)).toMatchObject({
      amountCents: 168,
      status: "estimated",
      basis: { minutes: 90, pauseMethod: "centered-duration-estimate" },
    });
  });
  it("prorates separate dated confirmations without rounding per day", () => {
    const result = calculateMonthlyDatedAllowances(
      "2026-09",
      [],
      work,
      [training()],
      [
        { ...entitlement("SHIFT_MONTHLY"), through: "2026-09-15" },
        { ...entitlement("ALTERNATING_MONTHLY"), from: "2026-09-16" },
      ],
      catalog,
    );
    expect(result.knownSubtotalCents).toBe(13125);
    expect(
      result.positions.filter((p) => p.amountCents !== null).every((p) => p.status === "estimated"),
    ).toBe(true);
    expect(
      result.positions.filter((p) => p.amountCents !== null).map((p) => p.amountCents),
    ).toEqual([3750, 9375]);
  });
  it.each([
    ["BT_K", "OTHER", 2310, 90, 224],
    ["BT_K", "KAV_BW", 2310, 88, 220],
    ["BT_B", "OTHER", 2340, 88, 220],
    ["BT_B", "KAV_BW", 2340, 88, 220],
  ] as const)(
    "uses historical amounts and the July boundary for %s/%s",
    (variant, region, weekly, julyShift, julyAlternating) => {
      for (const [month, lastDay] of [
        ["2025-04", "30"],
        ["2025-06", "30"],
        ["2025-07", "31"],
      ] as const) {
        const historical = month < "2025-07";
        for (const [status, cents] of [
          ["SHIFT_MONTHLY", historical ? 3000 : 7500],
          ["ALTERNATING_MONTHLY", historical ? 11625 : 18750],
          ["SHIFT_HOURLY", historical ? 36 : julyShift],
          ["ALTERNATING_HOURLY", historical ? 140 : julyAlternating],
        ] as const) {
          const result = calculateMonthlyDatedAllowances(
            month,
            [shift({ date: month + "-15" })],
            work,
            [training(weekly, variant, region)],
            [{ ...entitlement(status, month), through: month + "-" + lastDay }],
            catalog,
          );
          expect(shiftLine(result)).toMatchObject({ amountCents: cents, status: "calculated" });
          expect(result.knownSubtotalCents).toBe(cents);
          expect(result.complete).toBe(false);
        }
      }
    },
  );
  it("prorates historical monthly allowances without reducing hourly allowances twice", () => {
    for (const [status, cents] of [
      ["SHIFT_MONTHLY", 1500],
      ["ALTERNATING_MONTHLY", 5813],
      ["SHIFT_HOURLY", 36],
      ["ALTERNATING_HOURLY", 140],
    ] as const) {
      const result = calculateMonthlyDatedAllowances(
        "2025-06",
        [shift({ date: "2025-06-15" })],
        work,
        [training(1155)],
        [entitlement(status, "2025-06")],
        catalog,
      );
      expect(shiftLine(result).amountCents).toBe(cents);
    }
  });
  it("keeps the dbb historical source attached to exactly the old rule interval", () => {
    const oldRules = oldValue.rules.allowanceRules.filter((rule) => rule.validTo === "2025-06-30");
    expect(oldRules).toHaveLength(4);
    for (const rule of oldRules) {
      expect(rule.validFrom).toBe("2025-04-01");
      expect(rule.sourceIds).toContain("dbb-tariff-round-2025-10");
      expect(rule.sourceIds).toContain("vka-tvaoed-pflege-2025");
    }
    expect(
      oldValue.sources.find((source) => source.id === "dbb-tariff-round-2025-10")?.sha256,
    ).toBe("50cfdbd51983f5a18099d98d77c6c727e8e3f3b52d1fc3ff893794f87b512426");
  });
  it("does not fall forward to July amounts when the historical rule is missing", () => {
    const incomplete = structuredClone(oldValue) as RuleTariffPackage;
    incomplete.rules.allowanceRules = incomplete.rules.allowanceRules.filter(
      (rule) => rule.validFrom >= "2025-07-01",
    );
    const result = calculateMonthlyDatedAllowances(
      "2025-06",
      [],
      work,
      [training()],
      [entitlement("SHIFT_MONTHLY", "2025-06")],
      resolver([incomplete]),
    );
    expect(shiftLine(result)).toMatchObject({
      amountCents: null,
      issue: { code: "ALLOWANCE_RULE_MISSING" },
    });
  });
  it("computes a training-pattern estimate and accepts only tariff-scoped overrides", () => {
    const shifts = [
      shift({ id: "a", date: "2026-09-02", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "b", date: "2026-09-04", type: "EARLY", startTime: "07:00", endTime: "15:00" }),
      shift({ id: "c", date: "2026-09-06", type: "LATE", startTime: "13:00", endTime: "21:00" }),
      shift({ id: "d", date: "2026-09-23", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "e", date: "2026-09-24", startTime: "21:00", endTime: "07:00" }),
    ];
    const input = {
      month: "2026-09",
      shifts,
      workProfile: work,
      history: [training()],
      resolver: catalog,
      settings: {
        workplaceCoverage: "AROUND_THE_CLOCK" as const,
        assignment: "PERMANENT" as const,
        updatedAt: work.updatedAt,
      },
    };
    const estimate = deriveDatedAllowanceAssessments(input);
    expect(estimate.entitlements[0]).toMatchObject({
      status: "ALTERNATING_MONTHLY",
      origin: "estimated",
    });
    const decision = {
      from: "2026-09-01",
      through: "2026-09-30",
      tariff: { packageId: "tvaoed-pflege-vka", variant: "BT_K", region: "OTHER" },
      allowanceStatus: "SHIFT_MONTHLY" as const,
      revision: 2,
      confirmedAt: work.updatedAt,
      updatedAt: work.updatedAt,
    };
    const confirmed = deriveDatedAllowanceAssessments({ ...input, decisions: [decision] });
    expect(confirmed.entitlements[0]).toMatchObject({
      status: "SHIFT_MONTHLY",
      origin: "confirmed",
      revision: 2,
    });
    const mismatch = deriveDatedAllowanceAssessments({
      ...input,
      decisions: [{ ...decision, tariff: { ...decision.tariff, packageId: "tvoed-vka-bt-k" } }],
    });
    expect(mismatch.entitlements).toEqual([]);
    expect(mismatch.periods[0].issue?.code).toBe("ALLOWANCE_DECISION_TARIFF_MISMATCH");
  });
});
