import { describe, expect, it } from "vitest";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import type { OwnRemunerationConfiguration } from "@/domain/own-remuneration";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { calculateMonthlyDatedAllowances } from "./remuneration-allowances";
import {
  calculateDatedShiftOvertime,
  calculateMonthlyDatedOvertime,
} from "./remuneration-overtime";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";
function own(
  configuration: OwnRemunerationConfiguration = ownRemunerationFixture(),
  from = "2026-01-01",
): DatedRemunerationProfile {
  return {
    ...history(from),
    data: { version: 2, weeklyMinutes: 1155, selection: { kind: "own-configured", configuration } },
  };
}
const entry = shift({ overtimeMinutes: 60, tariffOvertimeConfirmed: true });
function saved(change: Partial<SavedOvertimeAllocation> = {}): SavedOvertimeAllocation {
  return {
    shiftId: entry.id,
    shiftRevision: entry.revision,
    timeZone: work.timeZone,
    allocations: [{ date: entry.date, minutes: 60 }],
    revision: 1,
    confirmedAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
    ...change,
  };
}
describe("dated supplement integration", () => {
  it("keeps the own fixed personal amount without requiring tariff entitlement", () => {
    const result = calculateMonthlyDatedAllowances("2026-10", [], work, [own()], [], resolver());
    expect(result).toMatchObject({ totalCents: 8000, complete: true, status: "calculated" });
  });
  it("pays only the explicitly confirmed own overtime", () => {
    expect(calculateDatedShiftOvertime(entry, work, [own()], resolver())).toMatchObject({
      totalCents: 3250,
      complete: true,
    });
    expect(
      calculateDatedShiftOvertime(
        { ...entry, tariffOvertimeConfirmed: false },
        work,
        [own()],
        resolver(),
      ),
    ).toMatchObject({ totalCents: 0, positions: [] });
  });
  it("requires a full explicit day allocation across a personal rate change", () => {
    const after = { ...ownRemunerationFixture(), percentageBasisHourlyCents: 3000 };
    const profiles = [own(), own(after, "2026-09-16")];
    expect(calculateDatedShiftOvertime(entry, work, profiles, resolver())).toMatchObject({
      totalCents: null,
      positions: [{ issue: { code: "OVERTIME_ALLOCATION_REQUIRED" } }],
    });
    expect(
      calculateDatedShiftOvertime(entry, work, profiles, resolver(), [
        { date: "2026-09-15", minutes: 30 },
        { date: "2026-09-16", minutes: 30 },
      ]),
    ).toMatchObject({ totalCents: 3575, complete: true });
  });
  it("does not fall back after a saved allocation is revoked", () => {
    const result = calculateDatedShiftOvertime(
      entry,
      work,
      [own()],
      resolver(),
      undefined,
      undefined,
      saved({ allocations: null }),
    );
    expect(result).toMatchObject({
      totalCents: null,
      positions: [{ issue: { code: "OVERTIME_ALLOCATION_REQUIRED" } }],
    });
  });
  it("rejects a stale saved allocation after a shift revision", () => {
    const result = calculateDatedShiftOvertime(
      { ...entry, revision: 2 },
      work,
      [own()],
      resolver(),
      undefined,
      undefined,
      saved(),
    );
    expect(result).toMatchObject({
      totalCents: null,
      positions: [{ issue: { code: "OVERTIME_ALLOCATION_REQUIRED" } }],
    });
  });
  it("rejects duplicate saved allocations before doubling pay", () => {
    expect(() =>
      calculateMonthlyDatedOvertime("2026-09", [entry], work, [own()], resolver(), undefined, [
        saved(),
        saved(),
      ]),
    ).toThrow("mehrfach");
  });
});
