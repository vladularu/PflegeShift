import { describe, expect, it } from "vitest";
import type { PremiumLine, ShiftPremiumBreakdown } from "@/domain/types";
import { buildPremiumBreakdown, premiumAmount } from "./premium-breakdown";

const line = (key: string, amount: number): PremiumLine => ({
  key,
  label: key,
  amount,
  minutes: 90,
  percentage: 20,
  hourlyRate: 25,
});
const row = (
  shiftId: string,
  date: string,
  premiumLines: PremiumLine[],
): ShiftPremiumBreakdown => ({
  shiftId,
  date,
  premiumLines,
  netMinutes: 480,
  overtimeBaseAmount: 50,
  overtimePremiumAmount: 15,
  totalAmount: 100,
});
describe("premium breakdown presentation", () => {
  const rows = [
    row("late", "2026-09-20", [line("night", 0.2), line("sunday", 25)]),
    row("early", "2026-09-01", [line("night", 0.1)]),
    row("none", "2026-09-02", []),
  ];
  it("orders services, totals existing premium lines in cents and excludes overtime", () => {
    const result = buildPremiumBreakdown(rows, [], null);
    expect(result.rows.map((item) => item.shiftId)).toEqual(["early", "late"]);
    expect(result.amount).toBe(25.3);
    expect(result.categories).toEqual([
      { key: "night", label: "Nacht", amount: 0.3 },
      { key: "sunday", label: "Sonntag", amount: 25 },
    ]);
    expect(premiumAmount([line("night", 0.1), line("night", 0.2)])).toBe(0.3);
  });
  it("filters lines as well as services without changing monthly category totals", () => {
    const result = buildPremiumBreakdown(rows, [], "sunday");
    expect(result.rows.map((item) => item.shiftId)).toEqual(["late"]);
    expect(result.rows[0].premiumLines.map((item) => item.key)).toEqual(["sunday"]);
    expect(result.amount).toBe(25);
    expect(result.categories[0].amount).toBe(0.3);
    expect(buildPremiumBreakdown(rows, [], "removed-category").activeFilter).toBeNull();
  });
});
