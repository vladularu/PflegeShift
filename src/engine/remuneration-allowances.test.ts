import { describe, expect, it } from "vitest";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";
import { calculateMonthlyPayEstimate } from "./pay";
import { calculateMonthlyDatedAllowances } from "./remuneration-allowances";
import { bindRemunerationTariffResolver } from "./remuneration-tariff-adapter";
import { candidate, resolver, work, history, shift } from "./remuneration-test-fixtures";

const entitlement = (
  status: DatedAllowanceEntitlement["status"] = "ALTERNATING_MONTHLY",
  change: Partial<DatedAllowanceEntitlement> = {},
): DatedAllowanceEntitlement => ({
  from: "2026-09-01",
  through: "2026-09-30",
  status,
  origin: "confirmed",
  revision: 1,
  ...change,
});
const run = (
  entitlements = [entitlement()],
  shifts = [shift()],
  profiles = [history()],
  packages = [candidate],
  month = "2026-09",
) =>
  calculateMonthlyDatedAllowances(month, shifts, work, profiles, entitlements, resolver(packages));

describe("dated tariff allowances", () => {
  it("keeps complete-month amounts identical to the existing engine", () => {
    const result = run();
    expect(result.totalCents).toBe(41682); // 250 + 141.82 + 25 EUR.
    expect(result.positions).toHaveLength(3);
    expect(result.status).toBe("calculated");
    const old = calculateMonthlyPayEstimate(
      "2026-09",
      [shift()],
      work,
      {
        month: "2026-09",
        allowanceStatus: "ALTERNATING_MONTHLY",
        revision: 1,
        confirmedAt: work.createdAt,
        updatedAt: work.updatedAt,
      },
      [],
      undefined,
      bindRemunerationTariffResolver(resolver(), candidate.packageId),
    );
    expect(result.totalCents).toBe(
      Math.round((old.allowanceAmount + old.careAllowanceAmount + old.tvoedAllowanceAmount) * 100),
    );
  });

  it("prorates a midmonth full-time to half-time change by calendar days", () => {
    const result = run([entitlement()], [], [history(), history("2026-09-16", "P5", 1155)]);
    expect(result.totalCents).toBe(31262); // 208.41 + 104.21 (components rounded separately).
    expect(
      result.positions
        .filter(
          (entry) =>
            entry.basis.allowanceType === "shift" ||
            entry.basis.allowanceType === "alternating-shift",
        )
        .map((entry) => entry.amountCents),
    ).toEqual([12500, 6250]);
  });

  it("reads an allowance-rule boundary even when package and profile do not change", () => {
    const pack = structuredClone(candidate);
    const rule = pack.rules.allowanceRules.find((item) => item.id === "care-monthly")!;
    rule.validTo = "2026-09-15";
    pack.rules.allowanceRules.push({
      ...rule,
      id: "care-synthetic-next",
      validFrom: "2026-09-16",
      validTo: "2027-03-31",
      amountCents: 20000,
    });
    const result = run([entitlement("NONE")], [], [history()], [pack]);
    expect(
      result.positions
        .filter((entry) => entry.basis.allowanceType === "care")
        .map((entry) => entry.amountCents),
    ).toEqual([7091, 10000]);
    expect(result.totalCents).toBe(19591);
  });

  it("does not prorate hourly allowances by part-time a second time", () => {
    const result = run(
      [entitlement("SHIFT_HOURLY")],
      [shift()],
      [history("2026-01-01", "P5", 1155)],
    );
    expect(result.positions.find((entry) => entry.basis.allowanceType === "shift")).toMatchObject({
      amountCents: 120,
      basis: { minutes: 120, rateCents: 60, proration: "worked-minutes" },
    });
  });

  it("places the whole-shift pause once, including both time changes", () => {
    for (const [date, month, minutes] of [
      ["2026-03-28", "2026-03", 420],
      ["2026-10-24", "2026-10", 540],
    ] as const) {
      const pack = structuredClone(candidate);
      pack.validFrom = "2026-01-01";
      pack.rules.allowanceRules = pack.rules.allowanceRules.map((rule) => ({
        ...rule,
        validFrom: "2026-01-01",
      }));
      const entry = entitlement("SHIFT_HOURLY", { from: month + "-01", through: month + "-31" });
      const result = run(
        [entry],
        [shift({ date, startTime: "22:00", endTime: "07:00", breakMinutes: 60 })],
        [history()],
        [pack],
        month,
      );
      expect(
        result.positions.find((position) => position.basis.allowanceType === "shift"),
      ).toMatchObject({
        status: "estimated",
        amountCents: minutes,
        basis: { minutes, pauseMethod: "centered-duration-estimate" },
      });
    }
  });

  it("includes preceding-month minutes and excludes next-month minutes", () => {
    const result = run(
      [entitlement("SHIFT_HOURLY")],
      [shift({ id: "previous", date: "2026-08-31" }), shift({ id: "next", date: "2026-09-30" })],
    );
    expect(result.positions.find((entry) => entry.basis.allowanceType === "shift")).toMatchObject({
      amountCents: 120,
      basis: { minutes: 120 },
    });
  });

  it("does not replace an unknown entitlement with a zero allowance", () => {
    const result = run([]);
    expect(result).toMatchObject({ complete: false, totalCents: null, knownSubtotalCents: 16682 });
    expect(
      result.positions.find((entry) => entry.basis.allowanceType === "shift")?.issue?.code,
    ).toBe("ALLOWANCE_DECISION_MISSING");
  });

  it("marks inferred entitlement as estimated but preserves explicit NONE", () => {
    expect(
      run([entitlement("ALTERNATING_MONTHLY", { origin: "estimated", revision: null })]).status,
    ).toBe("estimated");
    const result = run([entitlement("NONE")]);
    expect(result).toMatchObject({ status: "calculated", totalCents: 16682 });
    expect(
      result.positions.find((entry) => entry.basis.allowanceType === "shift")?.amountCents,
    ).toBe(0);
  });

  it.each([false, true])(
    "fails closed for missing or duplicate care rules (duplicate=%s)",
    (duplicate) => {
      const pack = structuredClone(candidate);
      const care = pack.rules.allowanceRules.find((rule) => rule.allowanceType === "care")!;
      pack.rules.allowanceRules = duplicate
        ? [...pack.rules.allowanceRules, { ...care, id: "duplicate-care" }]
        : pack.rules.allowanceRules.filter((rule) => rule !== care);
      const result = run([entitlement()], [], [history()], [pack]);
      expect(result.totalCents).toBeNull();
      expect(
        result.positions.find((entry) => entry.basis.allowanceType === "care")?.issue?.code,
      ).toBe(duplicate ? "ALLOWANCE_RULE_AMBIGUOUS" : "ALLOWANCE_RULE_MISSING");
    },
  );

  it("retains known amounts alongside a missing initial profile period", () => {
    expect(run([entitlement()], [], [history("2026-09-16")])).toMatchObject({
      complete: false,
      totalCents: null,
      knownSubtotalCents: 20841,
    });
  });

  it("does not add tariff allowances to an own-pay profile", () => {
    const own = {
      ...history(),
      data: {
        version: 1 as const,
        weeklyMinutes: 2310,
        selection: { kind: "own-monthly" as const, monthlyGrossCents: 300000 },
      },
    };
    expect(run([entitlement()], [], [own]).positions[0].issue?.code).toBe(
      "OWN_ALLOWANCES_UNCONFIGURED",
    );
  });

  it("splits confirmed decisions and keeps their revisions", () => {
    const result = run([
      entitlement("SHIFT_MONTHLY", { through: "2026-09-15" }),
      entitlement("ALTERNATING_MONTHLY", { from: "2026-09-16", revision: 2 }),
    ]);
    expect(
      result.positions
        .filter((entry) => entry.basis.entitlement)
        .map((entry) => [entry.amountCents, entry.basis.entitlement?.revision]),
    ).toEqual([
      [5000, 1],
      [12500, 2],
    ]);
  });

  it("rejects overlap, invalid entitlement dates and duplicated shifts", () => {
    expect(() => run([entitlement(), entitlement()])).toThrow("überschneiden");
    expect(() => run([entitlement("NONE", { through: "2026-09-31" })])).toThrow();
    expect(() => run([entitlement()], [shift(), shift()])).toThrow("mehrfach");
  });
});
