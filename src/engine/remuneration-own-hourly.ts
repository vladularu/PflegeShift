import { Temporal } from "@js-temporal/polyfill";
import {
  isCurrentPaidAbsence,
  isOwnPaidAbsence,
  validatePaidAbsence,
  type SavedPaidAbsence,
} from "@/domain/paid-absence";
import type { ShiftEntry } from "@/domain/types";
import type { BaseRemunerationPosition } from "@/domain/remuneration-result";
import type { RemunerationPeriod } from "./remuneration-context";
import { remunerationShiftDays } from "./remuneration-shift-days";
import { roundRemunerationCents } from "./remuneration-money";

export interface OwnHourlyInput {
  readonly shifts: readonly ShiftEntry[];
  readonly timeZone: string;
  readonly paidAbsences: readonly SavedPaidAbsence[];
}

export function calculateOwnHourlyPeriod(
  period: RemunerationPeriod,
  monthDays: number,
  input?: OwnHourlyInput,
): readonly BaseRemunerationPosition[] {
  const { context, from, through } = period;
  if (context.kind !== "own-configured" || context.configuration.base.kind !== "hourly")
    throw new Error("Eigener Stundenlohn fehlt.");
  const rateCents = context.configuration.base.centsPerHour;
  const base: BaseRemunerationPosition = {
    id: "hourly:" + from,
    kind: "base",
    label: "Stundenlohn · Arbeitszeit",
    from,
    through,
    amountCents: null,
    status: "unavailable",
    source: context.source,
    issue: null,
    basis: {
      fullTimeMonthlyCents: null,
      personalMonthlyCents: null,
      weeklyMinutes: context.weeklyMinutes,
      fullTimeWeeklyMinutes: null,
      calendarDays: Temporal.PlainDate.from(from).until(through).days + 1,
      monthDays,
      proration: "paid-minutes",
      hourly: {
        rateCents,
        paidMinutes: null,
        kind: "worked",
        shiftId: null,
        confirmationRevision: null,
        pauseEstimated: false,
      },
    },
  };
  if (!input)
    return [
      {
        ...base,
        issue: {
          code: "OWN_HOURLY_INPUT_MISSING",
          message: "Für Stundenlohn fehlen die Dienst- und Abwesenheitsdaten.",
        },
      },
    ];
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(input.timeZone);
  const confirmations = new Map<string, SavedPaidAbsence>();
  for (const raw of input.paidAbsences) {
    const value = validatePaidAbsence(raw);
    if (confirmations.has(value.shiftId)) throw new Error("Abwesenheit mehrfach bestätigt.");
    confirmations.set(value.shiftId, value);
  }
  const preceding = Temporal.PlainDate.from(from).subtract({ days: 1 }).toString();
  const entries = input.shifts.filter(
    (s) => s.deletedAt === null && s.date >= preceding && s.date <= through,
  );
  if (new Set(entries.map((s) => s.id)).size !== entries.length)
    throw new Error("Ein Eintrag wurde mehrfach zur Stundenvergütung übergeben.");
  let minutes = 0;
  let estimated = false;
  const others: BaseRemunerationPosition[] = [];
  for (const shift of entries) {
    if (isOwnPaidAbsence(shift)) {
      if (shift.date < from) continue;
      const confirmed = confirmations.get(shift.id);
      const valid =
        confirmed !== undefined && isCurrentPaidAbsence(confirmed, shift, input.timeZone);
      const paid = valid ? confirmed.paidMinutes : null;
      others.push({
        ...base,
        id: `hourly-absence:${shift.id}:${shift.date}`,
        label: "Bezahlte Abwesenheit · " + shift.title,
        from: shift.date,
        through: shift.date,
        amountCents: paid === null ? null : roundRemunerationCents(rateCents * paid, 60),
        status: valid ? "calculated" : "unavailable",
        basis: {
          ...base.basis,
          calendarDays: 1,
          hourly: {
            rateCents,
            paidMinutes: paid,
            kind: "absence",
            shiftId: shift.id,
            confirmationRevision: confirmed?.revision ?? null,
            pauseEstimated: false,
          },
        },
        issue: valid
          ? null
          : {
              code: "PAID_ABSENCE_UNCONFIRMED",
              message:
                "Bitte bezahlte Stunden für diesen Eintrag bestätigen; eine frühere Bestätigung fehlt, wurde aufgehoben oder passt nicht mehr.",
            },
      });
      continue;
    }
    const days = remunerationShiftDays(shift, input.timeZone);
    if (!days.length && shift.date >= from) {
      others.push({
        ...base,
        id: `hourly-missing:${shift.id}`,
        from: shift.date,
        through: shift.date,
        label: "Dienstzeit fehlt · " + shift.title,
        issue: {
          code: "WORK_TIME_MISSING",
          message: "Für diesen Arbeitsdienst fehlt eine berechenbare Dienstzeit.",
        },
      });
      continue;
    }
    const selected = days.filter((day) => day.date >= from && day.date <= through);
    minutes += selected.reduce((sum, day) => sum + day.netMinutes, 0);
    if (selected.length !== days.length && selected.some((day) => day.estimatedPause))
      estimated = true;
  }
  return [
    {
      ...base,
      amountCents: roundRemunerationCents(rateCents * minutes, 60),
      status: estimated ? "estimated" : "calculated",
      basis: {
        ...base.basis,
        hourly: { ...base.basis.hourly!, paidMinutes: minutes, pauseEstimated: estimated },
      },
    },
    ...others,
  ];
}
