import { describe, expect, it } from "vitest";
import type { ScopedAllowanceDecision } from "@/domain/remuneration-assessment";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { MonthlyTariffDecision, ShiftEntry } from "@/domain/types";
import { calculateMonthlyTvoedAssessment, calculateMonthlyPayEstimate } from "./pay";
import {
  deriveDatedAllowanceAssessments,
  type DatedAllowanceAssessmentInput,
} from "./remuneration-assessment";
import { calculateAssessedMonthlyRemuneration } from "./remuneration-month";
import { bindRemunerationTariffResolver } from "./remuneration-tariff-adapter";
import { assessTvoedKCalendarMonth } from "./tvoed-k-calendar-assessment";
import { candidate, resolver, work, history, shift } from "./remuneration-test-fixtures";

const settings = {
  workplaceCoverage: "AROUND_THE_CLOCK" as const,
  assignment: "PERMANENT" as const,
  updatedAt: work.updatedAt,
};
function service(date: string, type: ShiftEntry["type"] = "NIGHT"): ShiftEntry {
  const absence = type === "VACATION" || type === "SICK";
  return shift({
    id: date,
    date,
    type,
    startTime: absence ? null : type === "EARLY" ? "07:00" : type === "LATE" ? "13:00" : "21:00",
    endTime: absence ? null : type === "EARLY" ? "15:00" : type === "LATE" ? "21:00" : "07:00",
    allDay: absence,
    breakMinutes: absence ? 0 : 30,
  });
}
const september = [
  service("2026-09-02"),
  service("2026-09-04", "EARLY"),
  service("2026-09-06", "LATE"),
  service("2026-09-23"),
  service("2026-09-24"),
];
const input = (
  change: Partial<DatedAllowanceAssessmentInput> = {},
): DatedAllowanceAssessmentInput => ({
  month: "2026-09",
  shifts: september,
  workProfile: work,
  history: [history()],
  settings,
  resolver: resolver(),
  ...change,
});
const decision = (change: Partial<ScopedAllowanceDecision> = {}): ScopedAllowanceDecision => ({
  from: "2026-09-01",
  through: "2026-09-30",
  tariff: { packageId: candidate.packageId, variant: "BT_K", region: "OTHER" },
  allowanceStatus: "SHIFT_MONTHLY",
  revision: 1,
  confirmedAt: work.updatedAt,
  updatedAt: work.updatedAt,
  ...change,
});
const legacy: MonthlyTariffDecision = {
  month: "2026-09",
  allowanceStatus: "NONE",
  revision: 3,
  confirmedAt: work.updatedAt,
  updatedAt: work.updatedAt,
};
const own = (date: string): DatedRemunerationProfile => ({
  ...history(date),
  data: {
    version: 1,
    weeklyMinutes: 2310,
    selection: { kind: "own-monthly", monthlyGrossCents: 300000 },
  },
});

describe("dated allowance assessment orchestration", () => {
  it("rejects invalid or out-of-month policy dates", () => {
    for (const date of ["2026-09-31", "2026-08-31", "2026-09-01T00:00"]) {
      expect(() =>
        assessTvoedKCalendarMonth("2026-09", september, settings, resolver(), work.timeZone, date),
      ).toThrow();
    }
  });
  it("preserves the established whole-month BT-K estimate but labels it estimated", () => {
    const data = input();
    const result = deriveDatedAllowanceAssessments(data);
    const old = calculateMonthlyTvoedAssessment(
      "2026-09",
      september,
      september,
      settings,
      bindRemunerationTariffResolver(data.resolver!, candidate.packageId),
      work,
    );
    expect(result.periods[0].assessment).toEqual(old.assessment);
    expect(result.periods[0].nightSequence).toEqual(old.nightSequence);
    expect(result.periods[0].tariff).toEqual({
      packageId: candidate.packageId,
      variant: "BT_K",
      region: "OTHER",
    });
    expect(result).toMatchObject({
      complete: true,
      entitlements: [
        {
          from: "2026-09-01",
          through: "2026-09-30",
          status: "ALTERNATING_MONTHLY",
          origin: "estimated",
          revision: null,
        },
      ],
    });
  });

  it("integrates an automatically estimated allowance with the real monthly money calculation", () => {
    const data = input();
    const result = calculateAssessedMonthlyRemuneration(data);
    const old = calculateMonthlyPayEstimate(
      "2026-09",
      september,
      work,
      null,
      september,
      settings,
      bindRemunerationTariffResolver(data.resolver!, candidate.packageId),
    );
    expect(result).toMatchObject({
      complete: true,
      status: "estimated",
      allowances: { totalCents: 41682 },
    });
    expect(result.estimatedGrossCents).toBe(Math.round(old.estimatedGrossAmount! * 100));
  });

  it("uses the correct policy version at a midmonth package boundary", () => {
    const before = structuredClone(candidate);
    before.validTo = "2026-09-15";
    const after = structuredClone(candidate);
    after.validFrom = "2026-09-16";
    after.versionId = "synthetic-new-policy";
    after.rules.workPatternPolicy.regularChangeCount = 100;
    const result = deriveDatedAllowanceAssessments(input({ resolver: resolver([before, after]) }));
    expect(result.entitlements.map((entry) => entry.status)).toEqual([
      "ALTERNATING_MONTHLY",
      "NONE",
    ]);
    expect(result.periods.map((period) => period.source.versionId)).toEqual([
      candidate.versionId,
      "synthetic-new-policy",
    ]);
  });

  it("keeps the observation spell across a pure group or part-time change", () => {
    const result = deriveDatedAllowanceAssessments(
      input({ history: [history(), history("2026-09-16", "P6", 1155)] }),
    );
    expect(result.periods.map((period) => period.observedFrom)).toEqual([
      "2026-07-01",
      "2026-07-01",
    ]);
    expect(result.entitlements.map((entry) => entry.status)).toEqual([
      "ALTERNATING_MONTHLY",
      "ALTERNATING_MONTHLY",
    ]);
  });

  it("does not borrow earlier own-pay shifts for a newly selected tariff", () => {
    const result = deriveDatedAllowanceAssessments(
      input({ history: [own("2026-01-01"), history("2026-09-16")] }),
    );
    expect(result.periods[0].issue?.code).toBe("OWN_ASSESSMENT_UNSUPPORTED");
    expect(result.periods[0].nightSequence).toBeNull();
    expect(result.periods[1].nightSequence?.dates).toEqual([]);
    expect(result.periods[1]).toMatchObject({
      observedFrom: "2026-09-16",
      entitlement: { status: "NONE", origin: "estimated" },
    });
  });

  it("does not bridge a change away from and back to the same tariff", () => {
    const result = deriveDatedAllowanceAssessments(
      input({ history: [history(), own("2026-09-10"), history("2026-09-20")] }),
    );
    expect(result.periods[0].observedThrough).toBe("2026-09-09");
    expect(result.periods[0].nightSequence?.dates).toEqual([]);
    expect(result.periods[2].nightSequence?.dates).toEqual([]);
    expect(result.periods[2]).toMatchObject({
      observedFrom: "2026-09-20",
      entitlement: { status: "NONE" },
    });
  });

  it("keeps BT-B on its own existing assessment algorithm", () => {
    const profile = history();
    if (profile.data.selection.kind !== "tariff") throw new Error("fixture");
    const changed = {
      ...profile,
      data: { ...profile.data, selection: { ...profile.data.selection, variant: "BT_B" } },
    };
    const data = input({ history: [changed] });
    const result = deriveDatedAllowanceAssessments(data);
    const old = calculateMonthlyTvoedAssessment(
      "2026-09",
      september,
      september,
      settings,
      bindRemunerationTariffResolver(data.resolver!, candidate.packageId),
      { ...work, tariff: { ...work.tariff!, sector: "BT_B" } },
    );
    expect(result.periods[0].assessment).toEqual(old.assessment);
    expect(result.periods[0].nightSequence).toBeNull();
    expect(result.periods[0].tariff?.variant).toBe("BT_B");
  });

  it("cuts the observation spell at a regional or sector change", () => {
    for (const change of [{ region: "KAV_BW" }, { variant: "BT_B" }]) {
      const next = history("2026-09-16");
      if (next.data.selection.kind !== "tariff") throw new Error("fixture");
      const result = deriveDatedAllowanceAssessments(
        input({
          history: [
            history(),
            { ...next, data: { ...next.data, selection: { ...next.data.selection, ...change } } },
          ],
        }),
      );
      expect(result.periods.map((period) => [period.observedFrom, period.observedThrough])).toEqual(
        [
          ["2026-07-01", "2026-09-15"],
          ["2026-09-16", "2026-09-30"],
        ],
      );
    }
  });

  it.each(["assignment", "workplaceCoverage"] as const)(
    "does not convert unknown %s to a zero allowance",
    (key) => {
      const result = calculateAssessedMonthlyRemuneration(
        input({ settings: { ...settings, [key]: "UNKNOWN" } }),
      );
      expect(result.estimatedGrossCents).toBeNull();
      expect(result.allowanceAssessment.periods[0].issue?.code).toBe(
        "WORKPLACE_SETTINGS_UNCONFIRMED",
      );
      expect(result.allowanceAssessment.entitlements).toEqual([]);
    },
  );

  it("accepts an explicit tariff-bound NONE despite unknown workplace settings", () => {
    const result = deriveDatedAllowanceAssessments(
      input({
        settings: { ...settings, assignment: "UNKNOWN" },
        decisions: [decision({ allowanceStatus: "NONE" })],
      }),
    );
    expect(result).toMatchObject({
      complete: true,
      entitlements: [{ status: "NONE", origin: "confirmed", revision: 1 }],
    });
    expect(result.periods[0].issue).toBeNull();
    expect(result.periods[0].nightSequence?.dates).toHaveLength(3);
  });

  it("does not require around-the-clock coverage for a plain shift-work estimate", () => {
    const result = deriveDatedAllowanceAssessments(
      input({
        settings: { ...settings, workplaceCoverage: "UNKNOWN" },
        shifts: [
          service("2026-09-02", "EARLY"),
          service("2026-09-04", "LATE"),
          service("2026-09-06", "EARLY"),
          service("2026-09-08", "LATE"),
        ],
      }),
    );
    expect(result).toMatchObject({
      complete: true,
      entitlements: [{ status: "SHIFT_MONTHLY", origin: "estimated" }],
    });
  });

  it("retains but never silently reassigns an old unbound monthly decision", () => {
    const data = input({ legacyDecision: legacy });
    const result = calculateAssessedMonthlyRemuneration(data);
    expect(result.estimatedGrossCents).toBeNull();
    expect(result.allowanceAssessment.legacyDecision).toEqual(legacy);
    expect(result.allowanceAssessment.periods[0].issue?.code).toBe(
      "ALLOWANCE_RECONFIRMATION_REQUIRED",
    );
    expect(legacy.allowanceStatus).toBe("NONE");
  });

  it("new scoped confirmation replaces the legacy decision only for the confirmed dates", () => {
    const result = deriveDatedAllowanceAssessments(
      input({ legacyDecision: legacy, decisions: [decision({ from: "2026-09-16", revision: 4 })] }),
    );
    expect(result.periods[0]).toMatchObject({
      from: "2026-09-01",
      through: "2026-09-15",
      entitlement: null,
    });
    expect(result.periods[1]).toMatchObject({
      from: "2026-09-16",
      through: "2026-09-30",
      entitlement: { origin: "confirmed", revision: 4 },
    });
  });

  it("fills uncovered dates with estimates only when no legacy confirmation is being displaced", () => {
    const result = deriveDatedAllowanceAssessments(
      input({ decisions: [decision({ from: "2026-09-16" })] }),
    );
    expect(result.entitlements.map((entry) => [entry.from, entry.through, entry.origin])).toEqual([
      ["2026-09-01", "2026-09-15", "estimated"],
      ["2026-09-16", "2026-09-30", "confirmed"],
    ]);
  });

  it("rejects a confirmation from another tariff identity instead of silently estimating over it", () => {
    const result = deriveDatedAllowanceAssessments(
      input({
        decisions: [
          decision({
            tariff: { packageId: candidate.packageId, variant: "BT_K", region: "KAV_BW" },
          }),
        ],
      }),
    );
    expect(result.periods[0].issue?.code).toBe("ALLOWANCE_DECISION_TARIFF_MISMATCH");
    expect(result.entitlements).toEqual([]);
  });

  it("fails closed for unconfirmed history, unavailable packages and unsupported future tariffs", () => {
    expect(
      deriveDatedAllowanceAssessments(input({ history: [{ ...history(), effectiveFrom: null }] }))
        .periods[0].issue?.code,
    ).toBe("EFFECTIVE_DATE_UNKNOWN");
    expect(
      deriveDatedAllowanceAssessments(input({ resolver: resolver([]) })).periods[0].issue?.code,
    ).toBe("RULE_PACKAGE_NOT_FOUND");
    const future = history();
    if (future.data.selection.kind !== "tariff") throw new Error("fixture");
    expect(
      deriveDatedAllowanceAssessments(
        input({
          history: [
            {
              ...future,
              data: {
                ...future.data,
                selection: { ...future.data.selection, packageId: "future-tariff" },
              },
            },
          ],
        }),
      ).entitlements,
    ).toEqual([]);
  });

  it("supports a newly beginning midmonth package without resolving rules at the first of the month", () => {
    const pack = structuredClone(candidate);
    pack.validFrom = "2026-09-16";
    const result = deriveDatedAllowanceAssessments(input({ resolver: resolver([pack]) }));
    expect(result.periods[0].issue?.code).toBe("RULE_PACKAGE_NOT_FOUND");
    expect(result.periods[1].entitlement?.status).toBe("ALTERNATING_MONTHLY");
  });

  it("continues the existing absence estimate only inside the same tariff spell", () => {
    const data = input({
      month: "2026-10",
      shifts: [...september, service("2026-10-03", "VACATION")],
    });
    expect(deriveDatedAllowanceAssessments(data).entitlements[0].status).toBe(
      "ALTERNATING_MONTHLY",
    );
    expect(
      deriveDatedAllowanceAssessments({
        ...data,
        history: [own("2026-01-01"), history("2026-10-01")],
      }).entitlements[0].status,
    ).toBe("NONE");
  });

  it("recomputes after service edits without stale cached classifications", () => {
    const before = deriveDatedAllowanceAssessments(input());
    const after = deriveDatedAllowanceAssessments(
      input({
        shifts: september.map((entry) =>
          entry.type === "NIGHT"
            ? { ...entry, startTime: "08:00", endTime: "16:00", revision: 2 }
            : entry,
        ),
      }),
    );
    expect(before.entitlements[0].status).toBe("ALTERNATING_MONTHLY");
    expect(after.entitlements[0].status).not.toBe("ALTERNATING_MONTHLY");
  });

  it("rejects overlapping decisions, duplicate shifts, wrong months and invalid dates", () => {
    expect(() =>
      deriveDatedAllowanceAssessments(input({ decisions: [decision(), decision()] })),
    ).toThrow("überschneiden");
    expect(() =>
      deriveDatedAllowanceAssessments(input({ shifts: [...september, september[0]] })),
    ).toThrow("mehrfach");
    expect(() =>
      deriveDatedAllowanceAssessments(input({ legacyDecision: { ...legacy, month: "2026-08" } })),
    ).toThrow("anderen Monat");
    expect(() =>
      deriveDatedAllowanceAssessments(input({ decisions: [decision({ through: "2026-09-31" })] })),
    ).toThrow();
  });
});
