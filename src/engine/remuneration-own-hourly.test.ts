import { describe, expect, it } from "vitest";
import type { SavedPaidAbsence } from "@/domain/paid-absence";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { ShiftEntry } from "@/domain/types";
import { remunerationBasis } from "@/features/salary/remuneration-presentation";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { calculateAssessedMonthlyRemuneration } from "./remuneration-month";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

function own(rate = 2000, from = "2026-01-01"): DatedRemunerationProfile {
  return {
    ...history(from),
    data: {
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: {
          base: { kind: "hourly", centsPerHour: rate },
          percentageBasisHourlyCents: null,
          timePremiums: null,
          overtime: null,
          fixedAllowances: [],
          specialPayments: [],
        },
      },
    },
  };
}
const absence = (change: Partial<ShiftEntry> = {}) =>
  shift({
    id: "absence",
    type: "VACATION",
    allDay: true,
    startTime: null,
    endTime: null,
    ...change,
  });
function confirmation(entry: ShiftEntry, paidMinutes: number | null = 462): SavedPaidAbsence {
  return {
    shiftId: entry.id,
    shiftRevision: entry.revision,
    shiftDate: entry.date,
    shiftUpdatedAt: entry.updatedAt,
    timeZone: work.timeZone,
    paidMinutes,
    revision: 1,
    confirmedAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
  };
}
function run(
  shifts: readonly ShiftEntry[] = [shift()],
  paidAbsences: readonly SavedPaidAbsence[] = [],
  profiles = [own()],
  month = "2026-09",
) {
  return calculateAssessedMonthlyRemuneration({
    month,
    shifts,
    paidAbsences,
    workProfile: work,
    history: profiles,
    resolver: resolver([]),
    settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
  });
}

describe("own hourly base remuneration", () => {
  it("pays actual net minutes without a part-time multiplier or monthly divisor", () => {
    const result = run([shift({ startTime: "08:00", endTime: "16:00", breakMinutes: 30 })]);
    expect(result.base.totalCents).toBe(15000);
    expect(result.estimatedGrossCents).toBe(15000);
    expect(result.base.status).toBe("calculated");
    expect(result.base.positions[0].basis.hourly).toMatchObject({
      rateCents: 2000,
      paidMinutes: 450,
    });
  });
  it("does not turn absent source data into an empty calendar", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [own()]);
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("OWN_HOURLY_INPUT_MISSING");
    expect(run([]).estimatedGrossCents).toBe(0);
  });
  it.each(["VACATION", "SICK", "FREE", "TRAINING", "CUSTOM"] as const)(
    "requires explicit paid hours for %s rather than zero or eight hours",
    (type) => {
      const result = run([shift(), absence({ type })]);
      expect(result.base.totalCents).toBeNull();
      expect(result.base.knownSubtotalCents).toBe(4000);
      expect(result.estimatedGrossCents).toBeNull();
      expect(result.base.positions[1].issue?.code).toBe("PAID_ABSENCE_UNCONFIRMED");
    },
  );
  it("pays confirmed absence minutes separately without generating time premiums", () => {
    const entry = absence();
    const result = run([shift(), entry], [confirmation(entry)]);
    expect(result.base.totalCents).toBe(19400); // 2h worked + 7h42 confirmed at 20 EUR/h.
    expect(result.timePremiums.totalCents).toBe(0);
    expect(result.base.positions[1]).toMatchObject({
      amountCents: 15400,
      source: { kind: "profile", packageId: null },
      basis: { hourly: { kind: "absence", paidMinutes: 462, confirmationRevision: 1 } },
    });
    const lines = remunerationBasis(result.base.positions[1]);
    expect(lines).toContain("Persönlicher Stundenlohn: 20,00 €");
    expect(lines.some((line) => line.includes("Monatsbetrag"))).toBe(false);
  });
  it("distinguishes explicit unpaid time from a revoked confirmation", () => {
    const entry = absence();
    expect(run([entry], [confirmation(entry, 0)]).estimatedGrossCents).toBe(0);
    expect(run([entry], [confirmation(entry, null)]).estimatedGrossCents).toBeNull();
  });
  it.each(["revision", "date", "updatedAt", "zone"])(
    "rejects stale confirmation after a %s change",
    (kind) => {
      const entry = absence();
      const saved = confirmation(entry);
      const changed = {
        ...entry,
        ...(kind === "revision"
          ? { revision: 2 }
          : kind === "date"
            ? { date: "2026-09-16" }
            : kind === "updatedAt"
              ? { updatedAt: "2026-09-21T00:00:00Z" }
              : {}),
      };
      const result = run(
        [changed],
        [{ ...saved, ...(kind === "zone" ? { timeZone: "UTC" } : {}) }],
      );
      expect(result.estimatedGrossCents).toBeNull();
      expect(result.base.positions[1].issue?.code).toBe("PAID_ABSENCE_UNCONFIRMED");
    },
  );
  it("keeps independently confirmed absences and unresolved entries separate", () => {
    const one = absence();
    const two = absence({ id: "two", date: "2026-09-16", type: "SICK" });
    const result = run([one, two], [confirmation(one, 400)]);
    expect(result.base.knownSubtotalCents).toBe(13333);
    expect(result.base.totalCents).toBeNull();
    expect(result.base.positions).toHaveLength(3);
  });
  it("counts only the active profile and month for overnight work", () => {
    const entry = shift({ date: "2026-09-30" });
    const profiles = [own(), own(3000, "2026-10-01")];
    expect(run([entry], [], profiles).base.totalCents).toBe(2000);
    expect(run([entry], [], profiles, "2026-10").base.totalCents).toBe(3000);
  });
  it("marks a duration-only pause split across pay periods as an estimate", () => {
    const entry = shift({ date: "2026-09-30", breakMinutes: 60 });
    const result = run([entry]);
    expect(result.base.totalCents).toBe(1000);
    expect(result.base.status).toBe("estimated");
    expect(result.base.positions[0].basis.hourly?.pauseEstimated).toBe(true);
  });
  it.each([
    ["2026-03-29", "2026-03", 6000],
    ["2026-10-25", "2026-10", 10000],
  ])("uses actual elapsed hours at DST %s", (date, month, cents) => {
    expect(
      run(
        [shift({ date: String(date), startTime: "00:00", endTime: "04:00" })],
        [],
        [own()],
        String(month),
      ).base.totalCents,
    ).toBe(cents);
  });
  it("rounds work once per pay period, not each one-minute shift", () => {
    const entries = [
      shift({ id: "one", startTime: "08:00", endTime: "08:01" }),
      shift({ id: "two", startTime: "09:00", endTime: "09:01" }),
    ];
    expect(run(entries, [], [own(15)]).base.totalCents).toBe(1);
  });
  it("does not reinterpret a work shift without time as paid absence", () => {
    const result = run([shift({ startTime: null, endTime: null })]);
    expect(result.base.totalCents).toBeNull();
    expect(result.base.positions[1].issue?.code).toBe("WORK_TIME_MISSING");
  });
  it("ignores deleted and out-of-period absences and their confirmations", () => {
    const deleted = absence({ deletedAt: work.updatedAt });
    const outside = absence({ id: "outside", date: "2026-08-31" });
    expect(
      run([deleted, outside], [confirmation(deleted), confirmation(outside)]).estimatedGrossCents,
    ).toBe(0);
  });
  it("rejects duplicate entries or duplicate confirmations before double payment", () => {
    const entry = absence();
    expect(() => run([entry, entry])).toThrow("mehrfach");
    expect(() => run([entry], [confirmation(entry), confirmation(entry)])).toThrow("mehrfach");
  });
  it("keeps explicit overtime unpriced when the personal payout rules are not configured", () => {
    const result = run([
      shift({
        startTime: "08:00",
        endTime: "10:00",
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
      }),
    ]);
    expect(result.base.totalCents).toBe(4000);
    expect(result.overtime.totalCents).toBeNull();
    expect(result.estimatedGrossCents).toBeNull();
  });
});
