import type { PremiumLine, ShiftEntry, ShiftPremiumBreakdown } from "@/domain/types";

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  night: "Nacht",
  sunday: "Sonntag",
  holiday: "Feiertag",
  saturday: "Samstag",
  preholiday: "Vorfeiertag",
};

export function premiumAmount(lines: readonly PremiumLine[]): number {
  return lines.reduce((cents, line) => cents + Math.round(line.amount * 100), 0) / 100;
}

export function buildPremiumBreakdown(
  breakdowns: readonly ShiftPremiumBreakdown[],
  shifts: readonly ShiftEntry[],
  filter: string | null,
) {
  const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]));
  const categories = new Map<string, { key: string; label: string; cents: number }>();
  for (const item of breakdowns)
    for (const line of item.premiumLines) {
      const category = categories.get(line.key) ?? {
        key: line.key,
        label: CATEGORY_LABELS[line.key] ?? line.label,
        cents: 0,
      };
      category.cents += Math.round(line.amount * 100);
      categories.set(line.key, category);
    }
  const activeFilter = filter !== null && categories.has(filter) ? filter : null;
  const rows = breakdowns
    .map((item) => ({
      ...item,
      shift: shiftsById.get(item.shiftId),
      premiumLines: item.premiumLines.filter(
        (line) => activeFilter === null || line.key === activeFilter,
      ),
    }))
    .filter((item) => item.premiumLines.length > 0)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.shift?.startTime ?? "").localeCompare(b.shift?.startTime ?? "") ||
        a.shiftId.localeCompare(b.shiftId),
    );
  return {
    categories: [...categories.values()].map(({ cents, ...item }) => ({
      ...item,
      amount: cents / 100,
    })),
    activeFilter,
    rows,
    amount: premiumAmount(rows.flatMap((item) => item.premiumLines)),
  };
}
