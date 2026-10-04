import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { TvlCareAllowances } from "@/domain/tvl-care-allowances";
import { validateTvlBurnCareIntervals, type TvlBurnCareInterval } from "@/domain/tvl-burn-care";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import type { ShiftEntry } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import current from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import old from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import next from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import future from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { tvlFact, tvlProfile } from "./tvl-shift-work-test-fixtures";
import { resolver, shift, work } from "./remuneration-test-fixtures";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";

const rules = resolver([old, current, next, future] as RuleTariffPackage[]);
const p = (
  patch: Partial<TvlCareAllowances> = {},
  weeklyMinutes = 2310,
): DatedRemunerationProfile => {
  const original = tvlProfile();
  if (original.data.selection.kind !== "tariff") throw Error("fixture");
  return {
    ...original,
    effectiveFrom: "2025-11-01",
    data: {
      version: 5,
      weeklyMinutes,
      selection: {
        ...original.data.selection,
        group: "KR7",
        level: "2",
        tvlCareAllowances: {
          paidEntitlement: true,
          nursing: false,
          instructor: false,
          leadershipAnnexFNumber: "NONE",
          clinical: "DIRECT_HIGHER",
          burnCare: true,
          functionDuty: "NONE",
          ...patch,
        },
      },
    },
  };
};
const entry = (patch: Partial<ShiftEntry> = {}) =>
  shift({ date: "2026-09-19", startTime: "08:00", endTime: "16:00", breakMinutes: 60, ...patch });
const fact = (
  s: ShiftEntry,
  intervals: readonly TvlBurnCareInterval[] | null,
  profile = p(),
): SavedTvlShiftWork => ({ ...tvlFact(null, s, profile), burnCareIntervals: intervals });
const run = (
  shifts: readonly ShiftEntry[],
  facts: readonly SavedTvlShiftWork[],
  profiles = [p()],
  month = "2026-09",
  catalog = rules,
) =>
  calculateDatedMonthlyRemuneration({
    month,
    shifts,
    tvlShiftWork: facts,
    history: profiles,
    workProfile: work,
    allowanceEntitlements: [],
    resolver: catalog,
  });
const amount = (result: ReturnType<typeof run>, name: string) =>
  result.allowances.positions
    .filter((position) => position.id.startsWith("tvl-care:" + name + ":"))
    .map((position) => position.amountCents);

describe("TV-L actual burn care and monthly clinical offset", () => {
  it("uses actual activity only, leaves Saturday confirmation unknown and shows the offset once", () => {
    const s = entry();
    const result = run(
      [s],
      [
        fact(s, [
          { from: 0, until: 180 },
          { from: 240, until: 480 },
        ]),
      ],
    );
    expect(amount(result, "burn")).toEqual([1302]); // 7 * 186, not 8 * 186.
    expect(amount(result, "clinical")).toEqual([15000]);
    expect(amount(result, "burn-offset")).toEqual([-1302]);
    expect(result.allowances.knownSubtotalCents).toBe(15000);
    expect(result.estimatedGrossCents).toBeNull(); // Other TV-L cases still explicitly incomplete.
    const burn = result.allowances.positions.find((position) =>
      position.id.startsWith("tvl-care:burn:"),
    )!;
    expect(burn.basis.minutes).toBe(420);
    expect(burn.source.references.map((ref) => ref.id)).toContain("tdl-tvl-annex-f-care");
  });
  it.each([
    ["2025-11", 181],
    ["2026-04", 186],
    ["2027-03", 190],
    ["2028-01", 192],
  ] as const)("uses dated hourly amount in %s", (month, cents) => {
    const s = entry({ date: month + "-19" });
    expect(amount(run([s], [fact(s, [{ from: 0, until: 60 }])], [p()], month), "burn")).toEqual([
      cents,
    ]);
  });
  it("does not apply an extra part-time factor to real hourly work", () => {
    const s = entry(),
      profile = p({}, 1155);
    const result = run([s], [fact(s, [{ from: 0, until: 420 }], profile)], [profile]);
    expect(amount(result, "burn")).toEqual([1302]);
    expect(amount(result, "clinical")).toEqual([7500]);
    expect(result.allowances.knownSubtotalCents).toBe(7500);
  });
  it("caps the negative offset at the clinical allowance, never the earned hourly allowance", () => {
    const shifts = Array.from({ length: 12 }, (_, i) =>
      entry({
        id: "burn-" + i,
        date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        breakMinutes: 0,
      }),
    );
    const profile = p({ clinical: "DIRECT_LOWER" });
    const result = run(
      shifts,
      shifts.map((s) => fact(s, [{ from: 0, until: 480 }], profile)),
      [profile],
    );
    expect(amount(result, "burn")).toEqual([17856]);
    expect(amount(result, "burn-offset")).toEqual([-9000]);
    expect(result.allowances.knownSubtotalCents).toBe(17856);
  });
  it("sums confirmed fragments across services before estimating whole monthly hours", () => {
    const shifts = [entry({ id: "a" }), entry({ id: "b", date: "2026-09-20" })];
    const result = run(
      shifts,
      shifts.map((s) => fact(s, [{ from: 0, until: 30 }])),
    );
    expect(amount(result, "burn")).toEqual([186]);
    expect(amount(run([shifts[0]], [fact(shifts[0], [{ from: 0, until: 59 }])]), "burn")).toEqual([
      0,
    ]);
  });
  it("splits actual elapsed activity at calendar-month boundaries without paying the whole shift twice", () => {
    const s = entry({ date: "2026-09-30", startTime: "23:30", endTime: "01:30", breakMinutes: 0 });
    const values = [fact(s, [{ from: 0, until: 120 }])];
    expect(amount(run([s], values), "burn")).toEqual([0]);
    expect(amount(run([s], values, [p()], "2026-10"), "burn")).toEqual([186]);
  });
  it("uses elapsed rather than wall-clock hours across the autumn clock change", () => {
    const s = entry({ date: "2026-10-25", startTime: "01:00", endTime: "04:00", breakMinutes: 0 });
    expect(
      amount(run([s], [fact(s, [{ from: 0, until: 240 }])], [p()], "2026-10"), "burn"),
    ).toEqual([744]);
  });
  it.each([undefined, null, "stale", "duplicate", "outside", "pause", "overlap"] as const)(
    "leaves missing or invalid activity %s and its offset unknown",
    (scenario) => {
      const s = entry();
      let values: SavedTvlShiftWork[] = [fact(s, [{ from: 0, until: 60 }])];
      if (scenario === undefined) values = [tvlFact(true, s, p())];
      if (scenario === null) values = [fact(s, null)];
      if (scenario === "stale") values = [{ ...values[0], shiftRevision: 999 }];
      if (scenario === "duplicate") values.push(values[0]);
      if (scenario === "outside") values = [fact(s, [{ from: 450, until: 510 }])];
      if (scenario === "pause") values = [fact(s, [{ from: 0, until: 480 }])];
      if (scenario === "overlap")
        values = [
          fact(s, [
            { from: 0, until: 120 },
            { from: 60, until: 180 },
          ]),
        ];
      const result = run([s], values);
      expect(amount(result, "burn")).toEqual([null]);
      expect(amount(result, "clinical")).toEqual([null]);
    },
  );
  it("distinguishes explicitly no activity from missing data and does not offset independent nursing pay", () => {
    const s = entry(),
      profile = p({ nursing: true });
    const result = run([s], [fact(s, [], profile)], [profile]);
    expect(amount(result, "burn")).toEqual([0]);
    expect(amount(result, "burn-offset")).toEqual([]);
    expect(result.allowances.knownSubtotalCents).toBe(31351);
    const missing = run([s], [], [profile]);
    expect(missing.allowances.knownSubtotalCents).toBe(16351);
  });
  it("rejects overlapping activity from distinct services", () => {
    const shifts = [entry({ id: "first" }), entry({ id: "second" })];
    expect(
      amount(
        run(
          shifts,
          shifts.map((s) => fact(s, [{ from: 0, until: 60 }])),
        ),
        "burn",
      ),
    ).toEqual([null]);
  });
  it("requires matching profile portions at midnight and caps their combined activity at net shift duration", () => {
    const s = entry({ startTime: "20:00", endTime: "04:00" });
    const before = p(),
      after = { ...p({}, 1155), effectiveFrom: "2026-09-20" };
    const profiles = [before, after];
    const first = fact(s, [{ from: 0, until: 240 }], before);
    const second = fact(s, [{ from: 300, until: 480 }], after);
    expect(amount(run([s], [first, second], profiles), "burn")).toEqual([1302]);
    expect(
      amount(
        run([s], [first, { ...second, burnCareIntervals: [{ from: 240, until: 480 }] }], profiles),
        "burn",
      ),
    ).toEqual([null]);
    expect(
      amount(run([s], [fact(s, [{ from: 0, until: 420 }], before), second], profiles), "burn"),
    ).toEqual([null]);
  });
  it("takes new amounts from the catalogue instead of a hardcoded hourly constant", () => {
    const pkg = structuredClone(current) as RuleTariffPackage;
    pkg.rules.tvlCareAllowancePolicy!.burnCareFullHourCents = 250;
    const s = entry();
    expect(
      amount(
        run([s], [fact(s, [{ from: 0, until: 120 }])], [p()], "2026-09", resolver([pkg])),
        "burn",
      ),
    ).toEqual([500]);
  });
  it("recomputes annual values on a same-revision restore of actual activity", () => {
    const cache = createAnnualAvailableReportCache(),
      s = entry(),
      profile = p({ clinical: "NONE" });
    const annual = (intervals: readonly TvlBurnCareInterval[]) => {
      const steps = buildAnnualAvailableReportSteps(
        2026,
        [s],
        work,
        [],
        { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
        "2026-12-31",
        rules,
        {
          cache,
          remuneration: {
            status: "ready",
            profiles: [profile],
            shifts: [s],
            paidAbsences: [],
            overtimeAllocations: [],
            allowanceDecisions: [],
            tvlShiftWork: [fact(s, intervals, profile)],
          },
        },
      );
      for (;;) {
        const next = steps.next();
        if (next.done) return next.value.remuneration!;
      }
    };
    expect(annual([{ from: 0, until: 420 }]).allowances.knownSubtotalCents).toBe(1302);
    expect(annual([]).allowances.knownSubtotalCents).toBe(0);
  });
});

describe("actual TV-L burn interval contract", () => {
  it.each([
    null,
    [],
    [
      { from: 0, until: 30 },
      { from: 30, until: 60 },
    ],
  ])("preserves valid value %#", (value) => {
    expect(validateTvlBurnCareIntervals(value)).toEqual(value);
  });
  it.each([
    undefined,
    true,
    {},
    [{ from: -1, until: 60 }],
    [{ from: 0, until: 0 }],
    [{ from: 1.5, until: 60 }],
    [{ from: 0, until: 1501 }],
    [{ from: 0, until: 60, extra: true }],
    [
      { from: 0, until: 60 },
      { from: 30, until: 120 },
    ],
  ])("rejects malformed actual time %#", (value) => {
    expect(() => validateTvlBurnCareIntervals(value)).toThrow();
  });
});
