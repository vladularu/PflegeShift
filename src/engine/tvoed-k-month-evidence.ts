import { Temporal } from "@js-temporal/polyfill";

import { evaluateTvoedKNightReferences, type NightReferenceInput } from "./tvoed-k-night-reference";

export interface AbsenceEvidence {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  /** Section 21 paid release, not merely the calendar label SICK/VACATION. */
  readonly paidRelease: "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN";
  /** Required shift pattern would have been worked without this release. */
  readonly counterfactualShiftWork: "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN";
  readonly evidenceRef: string | null;
}

export interface MonthlyNightProposal {
  readonly month: string;
  readonly reference: {
    readonly anchorId: string;
    readonly followUpIds: readonly [string, string];
    /** Reviewed month attribution for a reference crossing a calendar month. */
    readonly crossMonthEvidenceRef: string | null;
  } | null;
}

export interface MonthlyNightInput extends Omit<
  NightReferenceInput,
  "allocatedFollowUpIds" | "unresolvedAbsences"
> {
  /** Contiguous months, replayed chronologically regardless of input order. */
  readonly proposals: readonly MonthlyNightProposal[];
  readonly absences: readonly AbsenceEvidence[];
  /** Explicit opening ledger; empty is not proof that prior allocation is known. */
  readonly priorAllocationComplete: boolean;
  readonly priorAllocations: readonly {
    readonly month: string;
    readonly followUpId: string;
  }[];
}

type MonthlyReason =
  | "PRIOR_ALLOCATION_UNKNOWN"
  | "PREVIOUS_MONTH_UNRESOLVED"
  | "MONTH_COVERAGE_INCOMPLETE"
  | "NO_MONTH_REFERENCE"
  | "REFERENCE_MISSING_OR_UNQUALIFIED"
  | "FOLLOW_UP_UNAVAILABLE"
  | "CROSS_MONTH_ATTRIBUTION_REQUIRED"
  | "REFERENCE_OUTSIDE_MONTH"
  | "ABSENCE_REVIEW"
  | "INCOMPLETE_WINDOW"
  | "UNKNOWN_NIGHT_MINUTES";

export interface MonthlyNightEvidence {
  readonly month: string;
  /** Only supports the proposed night evidence, NEVER the full allowance claim. */
  readonly state: "SUPPORTED" | "REVIEW";
  readonly reasons: readonly MonthlyReason[];
  readonly allocatedFollowUpIds: readonly string[];
  readonly anchorId: string | null;
  readonly proposedFollowUpIds: readonly string[];
  readonly crossMonthEvidenceRef: string | null;
  readonly absenceEvidence: readonly {
    readonly id: string;
    readonly state: "CONTINUATION_SUPPORTED" | "REVIEW";
    readonly evidenceRef: string | null;
  }[];
}

function monthDate(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error("Invalid evidence month.");
  return Temporal.PlainYearMonth.from(value).toPlainDate({ day: 1 });
}

function overlaps(start: string, end: string, from: string, until: string) {
  return Temporal.Instant.compare(start, until) < 0 && Temporal.Instant.compare(end, from) > 0;
}

function validateAbsences(absences: readonly AbsenceEvidence[]) {
  const ids = new Set<string>();
  for (const absence of absences) {
    if (!absence.id.trim() || ids.has(absence.id)) throw new Error("Invalid absence ID.");
    ids.add(absence.id);
    if (Temporal.Instant.compare(absence.start, absence.end) >= 0) {
      throw new Error("Invalid absence interval.");
    }
    for (const value of [absence.paidRelease, absence.counterfactualShiftWork]) {
      if (!["CONFIRMED", "NOT_CONFIRMED", "UNKNOWN"].includes(value)) {
        throw new Error("Invalid absence evidence status.");
      }
    }
  }
}

function orderedProposals(input: MonthlyNightInput) {
  const ordered = [...input.proposals].sort((a, b) => a.month.localeCompare(b.month));
  ordered.forEach((proposal, index) => {
    const date = monthDate(proposal.month);
    if (
      index > 0 &&
      monthDate(ordered[index - 1].month)
        .add({ months: 1 })
        .equals(date) === false
    ) {
      throw new Error("Evidence months must be unique and contiguous.");
    }
    const reference = proposal.reference;
    if (
      reference &&
      (!reference.anchorId.trim() ||
        reference.followUpIds.length !== 2 ||
        reference.followUpIds.some((id) => !id.trim() || id === reference.anchorId) ||
        new Set(reference.followUpIds).size !== 2)
    ) {
      throw new Error("A reference requires an anchor and two distinct follow-ups.");
    }
  });
  return ordered;
}

function openingAllocations(input: MonthlyNightInput, firstMonth: string | undefined) {
  const ids = new Set<string>();
  for (const allocation of input.priorAllocations) {
    monthDate(allocation.month);
    if (
      !allocation.followUpId.trim() ||
      ids.has(allocation.followUpId) ||
      (firstMonth !== undefined && allocation.month >= firstMonth)
    ) {
      throw new Error("Invalid opening allocation ledger.");
    }
    ids.add(allocation.followUpId);
  }
  return [...ids];
}

function assessMonth(
  input: MonthlyNightInput,
  proposal: MonthlyNightProposal,
  allocatedIds: readonly string[],
  previousUnresolved: boolean,
): MonthlyNightEvidence {
  const date = monthDate(proposal.month);
  const from = date.toZonedDateTime(input.timeZone).toInstant().toString();
  const until = date.add({ months: 1 }).toZonedDateTime(input.timeZone).toInstant().toString();
  const references = evaluateTvoedKNightReferences({
    ...input,
    allocatedFollowUpIds: allocatedIds,
    // Absence evidence is reported separately, never converted to actual nights.
    unresolvedAbsences: [],
  });
  const chosen = proposal.reference;
  const reference = references.find((item) => item.anchorId === chosen?.anchorId);
  const anchor = input.nights.find((night) => night.id === chosen?.anchorId);
  const relevantAbsences = input.absences
    .filter(
      (absence) =>
        overlaps(absence.start, absence.end, from, until) ||
        (anchor &&
          reference &&
          overlaps(absence.start, absence.end, anchor.start, reference.deadlineExclusive)) ||
        input.nights.some(
          (night) =>
            chosen?.followUpIds.includes(night.id) &&
            overlaps(absence.start, absence.end, night.start, night.end),
        ),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const reasons: MonthlyReason[] = [];
  if (!input.priorAllocationComplete) reasons.push("PRIOR_ALLOCATION_UNKNOWN");
  if (previousUnresolved) reasons.push("PREVIOUS_MONTH_UNRESOLVED");
  if (
    Temporal.Instant.compare(input.completeFrom, from) > 0 ||
    Temporal.Instant.compare(input.completeUntil, until) < 0
  )
    reasons.push("MONTH_COVERAGE_INCOMPLETE");
  if (!chosen) {
    reasons.push("NO_MONTH_REFERENCE");
  } else if (!reference) {
    reasons.push("REFERENCE_MISSING_OR_UNQUALIFIED");
  } else {
    reasons.push(...reference.reasons.filter((reason) => reason !== "ABSENCE"));
    if (chosen.followUpIds.some((id) => !reference.eligibleFollowUpIds.includes(id))) {
      reasons.push("FOLLOW_UP_UNAVAILABLE");
    }
    const months = [chosen.anchorId, ...chosen.followUpIds].map((id) => {
      const night = input.nights.find((item) => item.id === id);
      return night
        ? Temporal.Instant.from(night.start)
            .toZonedDateTimeISO(input.timeZone)
            .toPlainDate()
            .toPlainYearMonth()
            .toString()
        : null;
    });
    if (!months.includes(proposal.month)) reasons.push("REFERENCE_OUTSIDE_MONTH");
    if (months.some((month) => month !== proposal.month) && !chosen.crossMonthEvidenceRef?.trim()) {
      reasons.push("CROSS_MONTH_ATTRIBUTION_REQUIRED");
    }
  }
  if (relevantAbsences.length > 0) reasons.push("ABSENCE_REVIEW");
  return Object.freeze({
    month: proposal.month,
    state: reasons.length === 0 ? "SUPPORTED" : "REVIEW",
    reasons: Object.freeze(reasons),
    anchorId: chosen?.anchorId ?? null,
    proposedFollowUpIds: Object.freeze(chosen ? [...chosen.followUpIds] : []),
    crossMonthEvidenceRef: chosen?.crossMonthEvidenceRef ?? null,
    allocatedFollowUpIds: Object.freeze(
      reasons.length === 0 && chosen ? [...chosen.followUpIds] : [],
    ),
    absenceEvidence: Object.freeze(
      relevantAbsences.map((absence) =>
        Object.freeze({
          id: absence.id,
          state:
            absence.paidRelease === "CONFIRMED" &&
            absence.counterfactualShiftWork === "CONFIRMED" &&
            Boolean(absence.evidenceRef?.trim())
              ? ("CONTINUATION_SUPPORTED" as const)
              : ("REVIEW" as const),
          evidenceRef: absence.evidenceRef,
        }),
      ),
    ),
  });
}

/**
 * Replays a complete supplied ledger from scratch, so edits/deletions cannot reuse
 * stale downstream allocations. Caller-reviewed proposals are not legal findings.
 * No absent shift is fabricated, no salary/status is written, no clock/cache is read.
 */
export function evaluateTvoedKMonthlyEvidence(
  input: MonthlyNightInput,
): readonly MonthlyNightEvidence[] {
  validateAbsences(input.absences);
  const proposals = orderedProposals(input);
  let allocatedIds = openingAllocations(input, proposals[0]?.month);
  // Validate even when no months were requested.
  evaluateTvoedKNightReferences({
    ...input,
    allocatedFollowUpIds: allocatedIds,
    unresolvedAbsences: [],
  });
  const results: MonthlyNightEvidence[] = [];
  for (const proposal of proposals) {
    const result = assessMonth(
      input,
      proposal,
      allocatedIds,
      results.some((item) => item.state === "REVIEW"),
    );
    results.push(result);
    allocatedIds = [...allocatedIds, ...result.allocatedFollowUpIds];
  }
  return Object.freeze(results);
}
