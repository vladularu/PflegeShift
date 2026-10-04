import { describe, expect, it } from "vitest";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import type { ShiftEntry } from "@/domain/types";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { calculateDatedShiftTimePremiums } from "./remuneration-premiums";
import { work } from "./remuneration-test-fixtures";
import { tvlRules, tvlSaturday, tvlProfile, tvlFact } from "./tvl-shift-work-test-fixtures";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";

const settings = { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null } as const;
const monthly = (
  facts: readonly SavedTvlShiftWork[],
  shifts: readonly ShiftEntry[] = [tvlSaturday],
  profiles = [tvlProfile()],
) =>
  calculateDatedMonthlyRemuneration({
    month: "2026-09",
    shifts,
    history: profiles,
    workProfile: work,
    allowanceEntitlements: [],
    tvlShiftWork: facts,
    resolver: tvlRules,
  });

describe("stored TV-L facts through monthly and annual calculations", () => {
  it.each([
    [true, "SALARIED_SECTION_38_5_1", 64],
    [true, "OTHER", 0],
    [false, "SALARIED_SECTION_38_5_1", 380],
    [false, null, 380],
    [true, null, null],
    [null, "SALARIED_SECTION_38_5_1", null],
  ] as const)("uses %s with category %s without TVöD fallback", (value, category, cents) => {
    const profile = tvlProfile(category);
    const result = monthly([tvlFact(value, tvlSaturday, profile)], [tvlSaturday], [profile]);
    expect(result.timePremiums.totalCents).toBe(cents);
    expect(result.timePremiums.complete).toBe(cents !== null);
    expect(result.estimatedGrossCents).toBeNull(); // Other KR components are not yet supported.
    expect(result.timePremiums.positions.every((p) => p.source.packageId === "tvl-kr-tdl")).toBe(
      true,
    );
  });
  it.each([
    { shiftRevision: 2 },
    { shiftDate: "2026-09-18" },
    { shiftUpdatedAt: "2026-09-20T00:00:00Z" },
    { timeZone: "Europe/Paris" },
    { profileEffectiveFrom: "2026-05-01" },
    { profileRevision: 2 },
    { shiftId: "another" },
  ])("ignores mismatched bindings %j", (change) => {
    expect(monthly([{ ...tvlFact(true), ...change }]).timePremiums.totalCents).toBeNull();
  });
  it("does not pick an arbitrary duplicated confirmation", () => {
    expect(monthly([tvlFact(true), tvlFact(false)]).timePremiums.totalCents).toBeNull();
    expect(monthly([]).timePremiums.totalCents).toBeNull();
  });
  it("resolves the profile of the actual day after midnight", () => {
    const entry = { ...tvlSaturday, date: "2026-09-18", startTime: "23:00", endTime: "14:00" };
    const previous = tvlProfile();
    const next = { ...tvlProfile(), effectiveFrom: "2026-09-19" };
    const onlyPrevious = [tvlFact(false, entry, previous)];
    const run = (facts: readonly SavedTvlShiftWork[]) =>
      calculateDatedShiftTimePremiums(entry, work, [previous, next], tvlRules, "2026-09", facts);
    expect(run(onlyPrevious).totalCents).toBeNull();
    const complete = run([...onlyPrevious, tvlFact(true, entry, next)]);
    expect(complete.complete).toBe(true);
    const saturday = complete.positions.find((p) => p.basis.ruleId === "tvl-saturday-shift");
    expect(complete.positions.filter((p) => p.amountCents === 64)).toHaveLength(1);
    expect(
      saturday?.source.profileEffectiveFrom ??
        complete.positions.find((p) => p.amountCents === 64)?.source.profileEffectiveFrom,
    ).toBe(next.effectiveFrom);
  });
  it.each(["unchanged", "restore", "revocation", "shift", "profile"] as const)(
    "handles annual cache after %s independently",
    (change) => {
      const cache = createAnnualAvailableReportCache();
      const annual = (
        facts: readonly SavedTvlShiftWork[],
        entry = tvlSaturday,
        profile = tvlProfile(),
      ) => {
        const steps = buildAnnualAvailableReportSteps(
          2026,
          [entry],
          work,
          [],
          settings,
          "2026-12-31",
          tvlRules,
          {
            cache,
            remuneration: {
              status: "ready",
              profiles: [profile],
              shifts: [entry],
              allowanceDecisions: [],
              overtimeAllocations: [],
              paidAbsences: [],
              tvlShiftWork: facts,
            },
          },
        );
        for (;;) {
          const next = steps.next();
          if (next.done)
            return next.value.remuneration!.months.find((m) => m.month === "2026-09")!.result!;
        }
      };
      const first = annual([tvlFact(true)]);
      expect(first.timePremiums).toEqual(monthly([tvlFact(true)]).timePremiums);
      if (change === "unchanged") {
        expect(annual([{ ...tvlFact(true) }])).toBe(first);
        return;
      }
      const result =
        change === "restore"
          ? annual([tvlFact(false)])
          : change === "revocation"
            ? annual([tvlFact(null)])
            : change === "shift"
              ? annual([tvlFact(true)], { ...tvlSaturday, revision: 2 })
              : annual([tvlFact(true)], tvlSaturday, { ...tvlProfile(), revision: 2 });
      expect(result).not.toBe(first);
      expect(result.timePremiums.totalCents).toBe(change === "restore" ? 380 : null);
    },
  );
});
