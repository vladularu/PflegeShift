import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import currentValue from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import nextValue from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import futureValue from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import {
  UNKNOWN_TVL_CARE,
  validateTvlCareAllowances,
  type TvlCareAllowances,
} from "@/domain/tvl-care-allowances";
import { tvlProfile } from "./tvl-shift-work-test-fixtures";
import { resolver, work, shift } from "./remuneration-test-fixtures";
import { calculateMonthlyDatedAllowances } from "./remuneration-allowances";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";

const packages = [oldValue, currentValue, nextValue, futureValue] as RuleTariffPackage[];
const rules = resolver(packages);
const none: TvlCareAllowances = {
  paidEntitlement: true,
  nursing: false,
  instructor: false,
  clinical: "NONE",
  leadershipAnnexFNumber: "NONE",
  burnCare: false,
  functionDuty: "NONE",
};
function profile(
  patch: Partial<TvlCareAllowances> = {},
  group = "KR7",
  weekly = 2310,
): DatedRemunerationProfile {
  const old = tvlProfile();
  if (old.data.selection.kind !== "tariff") throw Error("fixture");
  return {
    ...old,
    effectiveFrom: "2025-11-01",
    data: {
      version: 5,
      weeklyMinutes: weekly,
      selection: {
        ...old.data.selection,
        group,
        level: "2",
        tvlCareAllowances: { ...none, ...patch },
      },
    },
  };
}
function run(
  month = "2026-07",
  patch: Partial<TvlCareAllowances> = {},
  group = "KR7",
  weekly = 2310,
) {
  return calculateMonthlyDatedAllowances(
    month,
    [],
    work,
    [profile(patch, group, weekly)],
    [],
    rules,
  ).positions.filter((p) => p.id.startsWith("tvl-care:"));
}
const amount = (positions: Readonly<ReturnType<typeof run>>, component: string) =>
  positions.filter((p) => p.id.startsWith("tvl-care:" + component + ":")).map((p) => p.amountCents);
describe("TV-L care allowance integration", () => {
  it.each([
    ["2025-11", 15906, 8900],
    ["2026-04", 16351, 9149],
    ["2027-03", 16678, 9332],
    ["2028-01", 16845, 9425],
  ] as const)("uses dated nursing/instructor rates in %s", (month, nursing, instructor) => {
    const positions = run(month, { nursing: true, instructor: true });
    expect(amount(positions, "nursing")).toEqual([nursing]);
    expect(amount(positions, "instructor")).toEqual([instructor]);
    expect(
      positions.find((p) => p.label === "TV-L-Pflegezulage")?.source.references.map((r) => r.id),
    ).toContain("tdl-tvl-annex-f-care");
  });
  it.each([
    ["DIRECT_LOWER", "KR5", 9000],
    ["DIRECT_HIGHER", "KR9", 15000],
    ["DIRECT_HIGHER", "KR10", null],
    ["LEADER_LOWER", "KR9", 9000],
    ["LEADER_HIGHER", "KR15", 15000],
    ["LEADER_HIGHER", "KR16", null],
    ["LEADER_LOWER", "KR8", null],
    ["NONE", "KR17", 0],
  ] as const)("validates clinical confirmation %s for %s", (clinical, group, expected) => {
    expect(amount(run("2026-07", { clinical }, group), "clinical")).toEqual([expected]);
  });
  it.each([
    [2, 64287],
    [3, 59653],
    [4, 55320],
    [5, 51299],
    [6, 47597],
    [7, 44172],
  ] as const)("uses leadership band %s exactly once", (leadershipAnnexFNumber, expected) => {
    expect(amount(run("2026-07", { leadershipAnnexFNumber }, "KR15"), "leadership")).toEqual([
      expected,
    ]);
    expect(amount(run("2026-07", { leadershipAnnexFNumber }, "KR7"), "leadership")).toEqual([null]);
  });
  it("does not infer entitlement from group, category or recorded work", () => {
    const positions = run("2026-07", { ...UNKNOWN_TVL_CARE, functionDuty: null });
    expect(positions).toHaveLength(6);
    expect(positions.every((p) => p.amountCents === null && p.status === "unavailable")).toBe(true);
    expect(run().every((p) => p.amountCents === 0)).toBe(true);
  });
  it("keeps independent known components when burn hours or offsets are unknown", () => {
    const positions = calculateMonthlyDatedAllowances(
      "2026-07",
      [shift({ date: "2026-07-01" })],
      work,
      [profile({ nursing: true, clinical: "DIRECT_HIGHER", burnCare: true })],
      [],
      rules,
    ).positions;
    expect(amount(positions, "nursing")).toEqual([16351]);
    expect(amount(positions, "clinical")).toEqual([null]);
    expect(amount(positions, "burn")).toEqual([null]);
  });
  it.each(["2025-11", "2026-04", "2027-03", "2028-01"])(
    "uses the section 43 function amount and source for %s without indexing it with Anlage F",
    (month) => {
      const positions = run(month, { functionDuty: "FUNCTION" });
      expect(amount(positions, "function")).toEqual([4500]);
      const position = positions.find((p) => p.basis.ruleId === "tvl-section-43:8")!;
      expect(position.status).toBe("estimated");
      expect(position.source.references.map((source) => source.id)).toContain("tdl-tv-l-2026");
    },
  );
  it.each([
    [{ functionDuty: "NONE" }, "KR7", 0],
    [{ functionDuty: null }, "KR7", null],
    [{ functionDuty: "LEADERSHIP" }, "KR9", 4500],
    [{ functionDuty: "LEADERSHIP" }, "KR7", null],
    [{ functionDuty: "FUNCTION", paidEntitlement: null }, "KR7", null],
    [{ functionDuty: "FUNCTION", paidEntitlement: false }, "KR7", 0],
    [{ functionDuty: "FUNCTION", clinical: "DIRECT_LOWER" }, "KR7", 0],
    [{ functionDuty: "FUNCTION", clinical: "DIRECT_HIGHER" }, "KR7", 0],
    [{ functionDuty: "LEADERSHIP", clinical: "LEADER_HIGHER" }, "KR9", 0],
    [{ functionDuty: "FUNCTION", clinical: null }, "KR7", null],
    [{ functionDuty: "FUNCTION", clinical: "DIRECT_HIGHER", burnCare: true }, "KR7", 0], // No entered work means no activity offset.
    [{ functionDuty: "FUNCTION", clinical: "DIRECT_HIGHER" }, "KR10", null],
  ] as const)(
    "does not infer, duplicate or silently ignore conflicting claims %#",
    (patch, group, expected) => {
      expect(amount(run("2026-07", patch, group), "function")).toEqual([expected]);
    },
  );
  it("keeps independent nursing and instruction pay alongside the function allowance", () => {
    const positions = run("2026-07", { nursing: true, instructor: true, functionDuty: "FUNCTION" });
    expect(amount(positions, "nursing")).toEqual([16351]);
    expect(amount(positions, "instructor")).toEqual([9149]);
    expect(amount(positions, "function")).toEqual([4500]);
  });
  it("uses catalogue updates and treats a missing function amount as unavailable", () => {
    const changed = structuredClone(currentValue) as RuleTariffPackage;
    const calculate = () =>
      calculateMonthlyDatedAllowances(
        "2026-07",
        [],
        work,
        [profile({ functionDuty: "FUNCTION" })],
        [],
        resolver([changed]),
      );
    changed.rules.tvlCareAllowancePolicy!.functionMonthlyCents = 6000;
    expect(amount(calculate().positions, "function")).toEqual([6000]);
    delete changed.rules.tvlCareAllowancePolicy!.functionMonthlyCents;
    expect(amount(calculate().positions, "function")).toEqual([null]);
  });
  it("prorates function pay once for part time and a change during the month", () => {
    expect(amount(run("2026-07", { functionDuty: "FUNCTION" }, "KR7", 1155), "function")).toEqual([
      2250,
    ]);
    const result = calculateMonthlyDatedAllowances(
      "2026-07",
      [],
      work,
      [
        profile(),
        { ...profile({ functionDuty: "FUNCTION" }, "KR7", 1155), effectiveFrom: "2026-07-17" },
      ],
      [],
      rules,
    );
    expect(amount(result.positions, "function")).toEqual([0, 1089]); // 2250 * 15/31
  });
  it("keeps legacy v5 facts unchanged and unknown while preserving all explicit function choices", () => {
    const legacy = { ...none };
    delete legacy.functionDuty;
    expect(validateTvlCareAllowances(legacy)).toEqual(legacy);
    expect(validateTvlCareAllowances(legacy)).not.toHaveProperty("functionDuty");
    const old = profile();
    if (old.data.version !== 5 || old.data.selection.kind !== "tariff") throw Error("fixture");
    const legacyProfile = {
      ...old,
      data: { ...old.data, selection: { ...old.data.selection, tvlCareAllowances: legacy } },
    };
    const result = calculateMonthlyDatedAllowances("2026-07", [], work, [legacyProfile], [], rules);
    expect(amount(result.positions, "function")).toEqual([null]);
    for (const functionDuty of [null, "NONE", "FUNCTION", "LEADERSHIP"] as const) {
      const input = { ...legacy, functionDuty };
      const result = validateTvlCareAllowances(input);
      expect(result).toEqual(input);
      expect(Object.isFrozen(result)).toBe(true);
    }
  });
  it.each([undefined, true, false, 4500, "ALL", {}])(
    "rejects malformed function confirmation %#",
    (functionDuty) => {
      expect(() => validateTvlCareAllowances({ ...none, functionDuty })).toThrow();
    },
  );
  it("prorates personal monthly pay then partial month once, not by each day", () => {
    expect(amount(run("2026-07", { nursing: true }, "KR7", 1155), "nursing")).toEqual([8176]);
    const first = profile();
    const second = { ...profile({ nursing: true }, "KR7", 1155), effectiveFrom: "2026-07-17" };
    const positions = calculateMonthlyDatedAllowances(
      "2026-07",
      [],
      work,
      [first, second],
      [],
      rules,
    ).positions;
    expect(amount(positions, "nursing")).toEqual([0, 3956]); // 8176 * 15 / 31
  });
  it("respects confirmed unpaid intervals without erasing the earlier paid period", () => {
    const first = profile({ nursing: true });
    const second = {
      ...profile({ nursing: true, paidEntitlement: false }),
      effectiveFrom: "2026-07-17",
    };
    const positions = calculateMonthlyDatedAllowances(
      "2026-07",
      [],
      work,
      [first, second],
      [],
      rules,
    ).positions;
    expect(amount(positions, "nursing")).toEqual([8439, 0]); // 16351 * 16 / 31
  });
  it("does not claim complete TV-L gross and uses changed catalogue amounts", () => {
    const changed = structuredClone(currentValue) as RuleTariffPackage;
    changed.rules.tvlCareAllowancePolicy!.nursingMonthlyCents = 20000;
    const result = calculateMonthlyDatedAllowances(
      "2026-07",
      [],
      work,
      [profile({ nursing: true })],
      [],
      resolver([changed]),
    );
    expect(amount(result.positions, "nursing")).toEqual([20000]);
    expect(result.totalCents).toBeNull();
  });
  it.each([
    ["nursing", 194877, 16351],
    ["function", 54000, 4500],
  ] as const)(
    "refreshes %s annual values after a same-revision restore and matches the monthly total",
    (component, yearAmount, monthAmount) => {
      const cache = createAnnualAvailableReportCache();
      const annual = (enabled: boolean) => {
        const steps = buildAnnualAvailableReportSteps(
          2026,
          [],
          work,
          [],
          {
            workplaceCoverage: "AROUND_THE_CLOCK",
            assignment: "PERMANENT",
            updatedAt: work.updatedAt,
          },
          "2026-12-31",
          rules,
          {
            cache,
            remuneration: {
              status: "ready",
              profiles: [
                profile(
                  component === "nursing"
                    ? { nursing: enabled }
                    : { functionDuty: enabled ? "FUNCTION" : "NONE" },
                ),
              ],
              shifts: [],
              paidAbsences: [],
              overtimeAllocations: [],
              allowanceDecisions: [],
            },
          },
        );
        for (;;) {
          const next = steps.next();
          if (next.done) return next.value.remuneration!;
        }
      };
      const before = annual(true);
      expect(before.allowances.knownSubtotalCents).toBe(yearAmount);
      expect(
        before.months.find((m) => m.month === "2026-07")?.result?.allowances.knownSubtotalCents,
      ).toBe(monthAmount);
      expect(annual(false).allowances.knownSubtotalCents).toBe(0);
    },
  );
});
