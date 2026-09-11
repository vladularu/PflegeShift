import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  evaluateTvoedKMonthlyEvidence,
  type AbsenceEvidence,
  type MonthlyNightInput,
} from "./tvoed-k-month-evidence";

function night(id: string, date: string) {
  const start = Temporal.PlainDate.from(date).toZonedDateTime({
    timeZone: "Europe/Berlin",
    plainTime: "21:00",
  });
  return {
    id,
    start: start.toInstant().toString(),
    end: start.add({ hours: 10 }).toInstant().toString(),
    netNightMinutes: 480,
  };
}

const july = [
  night("anchor", "2015-07-02"),
  night("first", "2015-07-23"),
  night("second", "2015-07-24"),
];
const proposal = {
  month: "2015-07",
  reference: {
    anchorId: "anchor",
    followUpIds: ["first", "second"] as const,
    crossMonthEvidenceRef: null,
  },
};
function input(overrides: Partial<MonthlyNightInput> = {}): MonthlyNightInput {
  return {
    nights: july,
    timeZone: "Europe/Berlin",
    completeFrom: "2015-07-01T00:00:00+02:00",
    completeUntil: "2015-10-01T00:00:00+02:00",
    proposals: [proposal],
    priorAllocationComplete: true,
    priorAllocations: [],
    absences: [],
    ...overrides,
  };
}
function absence(overrides: Partial<AbsenceEvidence> = {}): AbsenceEvidence {
  return {
    id: "leave",
    start: "2015-07-10T00:00:00+02:00",
    end: "2015-07-20T00:00:00+02:00",
    paidRelease: "UNKNOWN",
    counterfactualShiftWork: "UNKNOWN",
    evidenceRef: null,
    ...overrides,
  };
}
function twoMonths(): MonthlyNightInput {
  return input({
    nights: [...july, night("aug1", "2015-08-02"), night("aug2", "2015-08-03")],
    proposals: [
      proposal,
      {
        month: "2015-08",
        reference: {
          anchorId: "second",
          followUpIds: ["aug1", "aug2"],
          crossMonthEvidenceRef: "reviewed-fixture:cross-month",
        },
      },
    ],
  });
}

describe("BT-K monthly night evidence, not a salary or full entitlement decision", () => {
  it("assigns the BAG July dates to one month with assumed 21-07 times", () => {
    expect(evaluateTvoedKMonthlyEvidence(input())[0]).toEqual({
      month: "2015-07",
      state: "SUPPORTED",
      anchorId: "anchor",
      reasons: [],
      allocatedFollowUpIds: ["first", "second"],
      proposedFollowUpIds: ["first", "second"],
      crossMonthEvidenceRef: null,
      absenceEvidence: [],
    });
  });

  it("reuses an allocated follow-up as anchor, not as a second allocation", () => {
    const result = evaluateTvoedKMonthlyEvidence(twoMonths());
    expect(result.map((month) => month.state)).toEqual(["SUPPORTED", "SUPPORTED"]);
    expect(result.flatMap((month) => month.allocatedFollowUpIds)).toEqual([
      "first",
      "second",
      "aug1",
      "aug2",
    ]);
  });

  it("rejects a follow-up already counted in the opening ledger", () => {
    const result = evaluateTvoedKMonthlyEvidence(
      input({ priorAllocations: [{ month: "2015-06", followUpId: "first" }] }),
    )[0];
    expect(result.reasons).toContain("FOLLOW_UP_UNAVAILABLE");
    expect(result.allocatedFollowUpIds).toEqual([]);
  });

  it("rejects reuse across requested months even with a reviewed attribution", () => {
    const data = twoMonths();
    const result = evaluateTvoedKMonthlyEvidence({
      ...data,
      proposals: [
        proposal,
        {
          month: "2015-08",
          reference: {
            anchorId: "anchor",
            followUpIds: ["second", "aug1"],
            crossMonthEvidenceRef: "reviewed-fixture",
          },
        },
      ],
    });
    expect(result[1].reasons).toContain("FOLLOW_UP_UNAVAILABLE");
    expect(result[1].allocatedFollowUpIds).toEqual([]);
  });

  it("requires explicit cross-month attribution rather than choosing the second night's month", () => {
    const data = twoMonths();
    const second = data.proposals[1];
    const result = evaluateTvoedKMonthlyEvidence({
      ...data,
      proposals: [
        proposal,
        {
          ...second,
          reference: { ...second.reference!, crossMonthEvidenceRef: null },
        },
      ],
    });
    expect(result[1].reasons).toContain("CROSS_MONTH_ATTRIBUTION_REQUIRED");
  });

  it("does not accept an unrelated month even with an attribution note", () => {
    const result = evaluateTvoedKMonthlyEvidence(
      input({
        proposals: [
          {
            month: "2015-09",
            reference: { ...proposal.reference, crossMonthEvidenceRef: "note" },
          },
        ],
      }),
    )[0];
    expect(result.reasons).toContain("REFERENCE_OUTSIDE_MONTH");
  });

  it("retains the reviewed attribution and rejected proposal for audit", () => {
    const result = evaluateTvoedKMonthlyEvidence(twoMonths())[1];
    expect(result.crossMonthEvidenceRef).toBe("reviewed-fixture:cross-month");
    expect(result.proposedFollowUpIds).toEqual(["aug1", "aug2"]);
    expect(Object.isFrozen(result.proposedFollowUpIds)).toBe(true);
  });

  it("includes absence during the end of a boundary follow-up after the deadline", () => {
    const result = evaluateTvoedKMonthlyEvidence(
      input({
        nights: [july[0], july[1], night("second", "2015-08-03")],
        proposals: [
          {
            ...proposal,
            reference: { ...proposal.reference, crossMonthEvidenceRef: "boundary-fixture" },
          },
        ],
        absences: [
          absence({ start: "2015-08-04T00:00:00+02:00", end: "2015-08-04T08:00:00+02:00" }),
        ],
      }),
    )[0];
    expect(result.reasons).toContain("ABSENCE_REVIEW");
  });

  it("reports the BAG 10 AZR 58/09 vacation facts without synthesizing night work", () => {
    // Judgment dates; 21-07 are fixture assumptions, not court findings.
    const data = input({
      nights: [
        night("aug3", "2006-08-03"),
        night("aug4", "2006-08-04"),
        night("aug5", "2006-08-05"),
        night("aug6", "2006-08-06"),
        night("sep22", "2006-09-22"),
        night("sep23", "2006-09-23"),
        night("sep24", "2006-09-24"),
      ],
      completeFrom: "2006-08-01T00:00:00+02:00",
      completeUntil: "2006-11-01T00:00:00+01:00",
      proposals: [{ month: "2006-09", reference: null }],
      absences: [
        absence({
          start: "2006-08-14T00:00:00+02:00",
          end: "2006-09-13T00:00:00+02:00",
          paidRelease: "CONFIRMED",
          counterfactualShiftWork: "CONFIRMED",
          evidenceRef: "BAG-10-AZR-58-09-Rn4-13",
        }),
      ],
    });
    const result = evaluateTvoedKMonthlyEvidence(data)[0];
    expect(result.absenceEvidence[0].state).toBe("CONTINUATION_SUPPORTED");
    expect(result.allocatedFollowUpIds).toEqual([]);
    expect(data.nights).toHaveLength(7);
  });

  it("handles December/January and previous-year context", () => {
    const result = evaluateTvoedKMonthlyEvidence(
      input({
        nights: [
          night("anchor", "2026-12-20"),
          night("first", "2027-01-02"),
          night("second", "2027-01-03"),
        ],
        completeFrom: "2026-12-01T00:00:00+01:00",
        completeUntil: "2027-03-01T00:00:00+01:00",
        proposals: [
          {
            month: "2027-01",
            reference: {
              ...proposal.reference,
              crossMonthEvidenceRef: "reviewed-fixture:year-boundary",
            },
          },
        ],
      }),
    )[0];
    expect(result.state).toBe("SUPPORTED");
  });

  it("does not equate an empty opening ledger with known prior allocation", () => {
    expect(
      evaluateTvoedKMonthlyEvidence(input({ priorAllocationComplete: false }))[0].reasons,
    ).toContain("PRIOR_ALLOCATION_UNKNOWN");
  });

  it("distinguishes complete empty recording from incomplete recording without denying salary", () => {
    const empty = input({ nights: [], proposals: [{ month: "2015-07", reference: null }] });
    expect(evaluateTvoedKMonthlyEvidence(empty)[0].reasons).toEqual(["NO_MONTH_REFERENCE"]);
    expect(
      evaluateTvoedKMonthlyEvidence({ ...empty, completeUntil: "2015-07-15T00:00:00Z" })[0].reasons,
    ).toEqual(["MONTH_COVERAGE_INCOMPLETE", "NO_MONTH_REFERENCE"]);
  });

  it.each([
    { completeFrom: "2015-07-03T00:00:00Z" },
    { completeUntil: "2015-08-01T00:00:00Z" },
    { nights: [{ ...july[0], netNightMinutes: null }, ...july.slice(1)] },
    { nights: [july[0], july[1], { ...july[2], netNightMinutes: null }] },
    { nights: [july[0], july[1], { ...july[2], netNightMinutes: 119 }] },
    { nights: [{ ...july[0], netNightMinutes: 119 }, ...july.slice(1)] },
  ])("keeps partial or unqualified evidence under review: %j", (overrides) => {
    expect(evaluateTvoedKMonthlyEvidence(input(overrides))[0].state).toBe("REVIEW");
  });

  it.each(["UNKNOWN", "NOT_CONFIRMED"] as const)(
    "does not infer paid continuation from leave/illness: %s",
    (paidRelease) => {
      const result = evaluateTvoedKMonthlyEvidence(
        input({ absences: [absence({ paidRelease })] }),
      )[0];
      expect(result.reasons).toContain("ABSENCE_REVIEW");
      expect(result.absenceEvidence[0].state).toBe("REVIEW");
      expect(result.allocatedFollowUpIds).toEqual([]);
    },
  );

  it.each(["UNKNOWN", "NOT_CONFIRMED"] as const)(
    "requires evidence of the work that would have occurred: %s",
    (counterfactualShiftWork) => {
      expect(
        evaluateTvoedKMonthlyEvidence(
          input({
            absences: [
              absence({ paidRelease: "CONFIRMED", counterfactualShiftWork, evidenceRef: "plan" }),
            ],
          }),
        )[0].absenceEvidence[0].state,
      ).toBe("REVIEW");
    },
  );

  it("reports supported continuation separately, never fabricating actual nights", () => {
    const data = input({
      nights: [],
      proposals: [{ month: "2015-07", reference: null }],
      absences: [
        absence({
          paidRelease: "CONFIRMED",
          counterfactualShiftWork: "CONFIRMED",
          evidenceRef: "reviewed-duty-plan",
        }),
      ],
    });
    const before = JSON.stringify(data);
    const result = evaluateTvoedKMonthlyEvidence(data)[0];
    expect(result.absenceEvidence[0].state).toBe("CONTINUATION_SUPPORTED");
    expect(result.state).toBe("REVIEW");
    expect(result.allocatedFollowUpIds).toEqual([]);
    expect(JSON.stringify(data)).toBe(before);
  });

  it.each([null, "", "   "])(
    "does not accept unsupported confirmation without a source: %s",
    (evidenceRef) => {
      expect(
        evaluateTvoedKMonthlyEvidence(
          input({
            absences: [
              absence({
                paidRelease: "CONFIRMED",
                counterfactualShiftWork: "CONFIRMED",
                evidenceRef,
              }),
            ],
          }),
        )[0].absenceEvidence[0].state,
      ).toBe("REVIEW");
    },
  );

  it("includes an absence in a cross-month reference, not only the output month", () => {
    const data = twoMonths();
    const result = evaluateTvoedKMonthlyEvidence({
      ...data,
      proposals: [data.proposals[1]],
      absences: [absence({ start: "2015-07-26T00:00:00Z", end: "2015-07-28T00:00:00Z" })],
    });
    expect(result[0].reasons).toContain("ABSENCE_REVIEW");
  });

  it("ignores unrelated absences and respects end-exclusive boundaries", () => {
    const result = evaluateTvoedKMonthlyEvidence(
      input({
        absences: [
          absence({ start: "2015-06-20T00:00:00+02:00", end: "2015-07-01T00:00:00+02:00" }),
          absence({ id: "later", start: "2015-09-01T00:00:00Z", end: "2015-09-05T00:00:00Z" }),
        ],
      }),
    )[0];
    expect(result.state).toBe("SUPPORTED");
    expect(result.absenceEvidence).toEqual([]);
  });

  it.each(["delete", "edit"])(
    "replays dependent months after a %s rather than keeping cached allocations",
    (change) => {
      const data = twoMonths();
      expect(evaluateTvoedKMonthlyEvidence(data)[1].state).toBe("SUPPORTED");
      const nights =
        change === "delete"
          ? data.nights.filter((item) => item.id !== "first")
          : data.nights.map((item) =>
              item.id === "first" ? { ...item, netNightMinutes: 119 } : item,
            );
      const result = evaluateTvoedKMonthlyEvidence({ ...data, nights });
      expect(result[0].state).toBe("REVIEW");
      expect(result[1].reasons).toContain("PREVIOUS_MONTH_UNRESOLVED");
      expect(result.flatMap((item) => item.allocatedFollowUpIds)).toEqual([]);
      expect(evaluateTvoedKMonthlyEvidence(data)[1].state).toBe("SUPPORTED");
    },
  );

  it("is deterministic and freezes nested results without mutating input", () => {
    const data = twoMonths();
    const reversed = {
      ...data,
      nights: Object.freeze([...data.nights].reverse()),
      proposals: Object.freeze([...data.proposals].reverse()),
    };
    const before = JSON.stringify(reversed);
    const result = evaluateTvoedKMonthlyEvidence(reversed);
    expect(result).toEqual(evaluateTvoedKMonthlyEvidence(data));
    expect(JSON.stringify(reversed)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0].reasons)).toBe(true);
    expect(Object.isFrozen(result[0].allocatedFollowUpIds)).toBe(true);
    expect(Object.isFrozen(result[0].absenceEvidence)).toBe(true);
  });

  it("returns no payment or allowance status", () => {
    const result = evaluateTvoedKMonthlyEvidence(input())[0];
    expect(result).not.toHaveProperty("allowanceStatus");
    expect(result).not.toHaveProperty("amount");
  });

  it.each([
    { proposals: [proposal, proposal] },
    { proposals: [proposal, { ...proposal, month: "2015-09" }] },
    { proposals: [{ ...proposal, month: "2015-13" }] },
    { proposals: [{ ...proposal, month: "2015-7" }] },
    { proposals: [{ ...proposal, reference: { ...proposal.reference, anchorId: " " } }] },
    {
      proposals: [
        {
          ...proposal,
          reference: { ...proposal.reference, followUpIds: ["first", "first"] as const },
        },
      ],
    },
    {
      proposals: [
        {
          ...proposal,
          reference: { ...proposal.reference, followUpIds: ["anchor", "second"] as const },
        },
      ],
    },
    { priorAllocations: [{ month: "2015-07", followUpId: "first" }] },
    { priorAllocations: [{ month: "2015-06", followUpId: " " }] },
    {
      priorAllocations: [
        { month: "2015-06", followUpId: "first" },
        { month: "2015-05", followUpId: "first" },
      ],
    },
    { absences: [absence(), absence()] },
    { absences: [absence({ id: " " })] },
    { absences: [absence({ end: "2015-07-01T00:00:00Z" })] },
    { proposals: [], timeZone: "invalid" },
    { proposals: [], nights: [july[0], july[0]] },
  ])("rejects malformed contracts before returning allocations: %j", (overrides) => {
    expect(() => evaluateTvoedKMonthlyEvidence(input(overrides))).toThrow();
  });
});
