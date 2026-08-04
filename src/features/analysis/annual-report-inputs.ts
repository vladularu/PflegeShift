import type { CalendarEntry, MonthlyTariffDecision } from "@/domain/types";

export interface AnnualReportInputs {
  readonly entries: readonly CalendarEntry[];
  readonly tariffDecisions: readonly MonthlyTariffDecision[];
  readonly year: number;
}

function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function selectAnnualReportInputs(
  previous: AnnualReportInputs | null,
  year: number,
  entries: readonly CalendarEntry[],
  tariffDecisions: readonly MonthlyTariffDecision[],
): AnnualReportInputs {
  const rangeStart = `${year - 1}-11-01`;
  const rangeEnd = `${year + 1}-01-28`;
  const selectedEntries = entries.filter(
    (entry) => entry.date >= rangeStart && entry.date <= rangeEnd,
  );
  const selectedDecisions = tariffDecisions.filter((decision) =>
    decision.month.startsWith(`${year}-`),
  );
  const canReuse = previous?.year === year;
  const stableEntries =
    canReuse && sameItems(previous.entries, selectedEntries)
      ? previous.entries
      : Object.freeze(selectedEntries);
  const stableDecisions =
    canReuse && sameItems(previous.tariffDecisions, selectedDecisions)
      ? previous.tariffDecisions
      : Object.freeze(selectedDecisions);

  if (
    previous !== null &&
    previous.year === year &&
    previous.entries === stableEntries &&
    previous.tariffDecisions === stableDecisions
  ) {
    return previous;
  }

  return {
    year,
    entries: stableEntries,
    tariffDecisions: stableDecisions,
  };
}
