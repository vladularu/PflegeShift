import { Temporal } from "@js-temporal/polyfill";

/** Experimental BT-K evidence only. Never an allowance/entitlement decision. */
export interface TariffNightObservation {
  readonly id: string;
  /** ISO instants with offsets; the adapter must resolve overnight/DST boundaries. */
  readonly start: string;
  readonly end: string;
  /** Actual net night minutes, or null when pause placement/qualification is unknown. */
  readonly netNightMinutes: number | null;
}

export interface NightReferenceInput {
  readonly nights: readonly TariffNightObservation[];
  readonly timeZone: string;
  /** Complete observation interval, including empty days; end is exclusive. */
  readonly completeFrom: string;
  readonly completeUntil: string;
  /** Already allocated follow-ups cannot support another monthly award. */
  readonly allocatedFollowUpIds: readonly string[];
  /** Absences need a separate entitlement review, not a fabricated worked night. */
  readonly unresolvedAbsences: readonly { readonly start: string; readonly end: string }[];
}

export interface NightReferenceEvidence {
  readonly anchorId: string;
  readonly deadlineDate: string;
  readonly deadlineExclusive: string;
  readonly eligibleFollowUpIds: readonly string[];
  readonly state: "MET" | "NOT_MET" | "REVIEW";
  readonly reasons: readonly ("INCOMPLETE_WINDOW" | "UNKNOWN_NIGHT_MINUTES" | "ABSENCE")[];
}

const MINIMUM_NIGHT_MINUTES = 120;

/** BAG 6 AZR 191/17 Rn. 16-18; event period under BGB 187(1), 188(2)-(3). */
export function tvoedKNightDeadline(end: string, timeZone: string) {
  const endDate = Temporal.Instant.from(end).toZonedDateTimeISO(timeZone).toPlainDate();
  const deadlineDate = endDate.add({ months: 1 }, { overflow: "constrain" });
  return Object.freeze({
    deadlineDate: deadlineDate.toString(),
    // Next local midnight is exclusive; adding fixed hours is wrong across DST.
    deadlineExclusive: deadlineDate
      .add({ days: 1 })
      .toZonedDateTime(timeZone)
      .toInstant()
      .toString(),
  });
}

function interval(start: string, end: string) {
  const from = Temporal.Instant.from(start);
  const until = Temporal.Instant.from(end);
  if (Temporal.Instant.compare(from, until) >= 0) throw new Error("Invalid observation interval.");
  return { from, until };
}

/**
 * Returns independent candidate windows, NOT a monthly allocation or payment.
 * Input qualification must come from reviewed actual night work, not the NIGHT label.
 * The caller must not treat all overlapping MET windows as separate entitlements.
 */
export function evaluateTvoedKNightReferences(
  input: NightReferenceInput,
): readonly NightReferenceEvidence[] {
  const coverage = interval(input.completeFrom, input.completeUntil);
  // Validate even for an empty list.
  coverage.from.toZonedDateTimeISO(input.timeZone);
  const ids = new Set(input.nights.map((night) => night.id));
  if (ids.size !== input.nights.length || input.nights.some((night) => !night.id.trim())) {
    throw new Error("Night observations require unique nonempty IDs.");
  }
  const observations = input.nights
    .map((night) => {
      const times = interval(night.start, night.end);
      const duration = times.until.since(times.from).total("minutes");
      if (
        night.netNightMinutes !== null &&
        (!Number.isFinite(night.netNightMinutes) ||
          night.netNightMinutes < 0 ||
          night.netNightMinutes > duration)
      ) {
        throw new Error("Invalid net night minutes.");
      }
      return { ...night, ...times };
    })
    .sort((a, b) => Temporal.Instant.compare(a.from, b.from));
  if (
    observations.some(
      (night, index) =>
        index > 0 && Temporal.Instant.compare(night.from, observations[index - 1].until) < 0,
    )
  ) {
    throw new Error("Overlapping night observations require clarification.");
  }
  const absences = input.unresolvedAbsences.map((absence) => interval(absence.start, absence.end));
  const allocated = new Set(input.allocatedFollowUpIds);
  return Object.freeze(
    observations
      .filter(
        (night) => night.netNightMinutes === null || night.netNightMinutes >= MINIMUM_NIGHT_MINUTES,
      )
      .map((anchor): NightReferenceEvidence => {
        const deadline = tvoedKNightDeadline(anchor.end, input.timeZone);
        const exclusive = Temporal.Instant.from(deadline.deadlineExclusive);
        const following = observations.filter(
          (night) =>
            night.id !== anchor.id &&
            Temporal.Instant.compare(night.from, anchor.until) >= 0 &&
            Temporal.Instant.compare(night.from, exclusive) < 0 &&
            !allocated.has(night.id),
        );
        const eligible = following.filter(
          (night) =>
            night.netNightMinutes !== null && night.netNightMinutes >= MINIMUM_NIGHT_MINUTES,
        );
        const reasons: NightReferenceEvidence["reasons"] = [
          ...(Temporal.Instant.compare(coverage.from, anchor.from) > 0 ||
          Temporal.Instant.compare(coverage.until, exclusive) < 0 ||
          following.some((night) => Temporal.Instant.compare(night.until, coverage.until) > 0)
            ? (["INCOMPLETE_WINDOW"] as const)
            : []),
          ...(anchor.netNightMinutes === null ||
          following.some((night) => night.netNightMinutes === null)
            ? (["UNKNOWN_NIGHT_MINUTES"] as const)
            : []),
          ...(absences.some(
            (absence) =>
              Temporal.Instant.compare(absence.from, exclusive) < 0 &&
              Temporal.Instant.compare(absence.until, anchor.from) > 0,
          )
            ? (["ABSENCE"] as const)
            : []),
        ];
        return Object.freeze({
          anchorId: anchor.id,
          ...deadline,
          eligibleFollowUpIds: Object.freeze(eligible.map((night) => night.id)),
          state: reasons.length > 0 ? "REVIEW" : eligible.length >= 2 ? "MET" : "NOT_MET",
          reasons: Object.freeze(reasons),
        });
      }),
  );
}
