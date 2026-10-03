import { describe, expect, it } from "vitest";
import type { OwnRemunerationConfiguration } from "@/domain/own-remuneration";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import {
  calculateAssessedMonthlyRemuneration,
  calculateDatedMonthlyRemuneration,
} from "./remuneration-month";
import { tariffAnnualFixture } from "./tariff-annual-test-fixtures";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";
function own(
  configuration = ownRemunerationFixture(),
  date = "2026-01-01",
): DatedRemunerationProfile {
  return {
    ...history(date),
    data: { version: 2, weeklyMinutes: 1155, selection: { kind: "own-configured", configuration } },
  };
}
const settings = {
  workplaceCoverage: "UNKNOWN" as const,
  assignment: "UNKNOWN" as const,
  updatedAt: null,
};
const input = (month = "2026-09", profiles = [own()]) => ({
  month,
  history: profiles,
  shifts: [],
  workProfile: work,
  settings,
  resolver: resolver(),
});
describe("shared dated monthly result", () => {
  it("retains a personal monthly amount without worked shifts or assumed tariff eligibility", () => {
    const result = calculateAssessedMonthlyRemuneration(input());
    expect(result).toMatchObject({
      complete: true,
      estimatedGrossCents: 200000,
      base: { totalCents: 200000 },
      allowances: { totalCents: 0 },
      annualPayments: { totalCents: 0 },
    });
    expect(result.allowanceAssessment.entitlements).toEqual([]);
  });
  it("keeps a known personal allowance when another component is unknown", () => {
    const result = calculateAssessedMonthlyRemuneration(
      input("2026-10", [own(ownRemunerationFixture(), "2026-10-16")]),
    );
    expect(result.complete).toBe(false);
    expect(result.estimatedGrossCents).toBeNull();
    expect(result.allowances.knownSubtotalCents).toBe(4129);
    expect(result.knownSubtotalCents).toBeGreaterThanOrEqual(4129);
  });
  it("does not invent history from the current work profile", () => {
    const result = calculateAssessedMonthlyRemuneration(input("2026-09", []));
    expect(result.complete).toBe(false);
    expect(result.estimatedGrossCents).toBeNull();
    expect(result.base.positions[0].issue?.code).toBe("PROFILE_MISSING");
  });
  it("counts actual hourly minutes once without reducing them again for part time", () => {
    const configuration: OwnRemunerationConfiguration = {
      ...ownRemunerationFixture(),
      base: { kind: "hourly", centsPerHour: 2000 },
      percentageBasisHourlyCents: null,
    };
    const result = calculateAssessedMonthlyRemuneration({
      ...input("2026-09", [own(configuration)]),
      shifts: [shift({ startTime: "10:00", endTime: "11:00", breakMinutes: 15 })],
    });
    expect(result).toMatchObject({
      complete: true,
      base: { totalCents: 1500 },
      estimatedGrossCents: 1500,
    });
  });
  it("includes a configured annual estimate only in its declared payout month", () => {
    expect(calculateAssessedMonthlyRemuneration(input("2026-10")).annualPayments.totalCents).toBe(
      0,
    );
    const november = calculateAssessedMonthlyRemuneration(input("2026-11"));
    expect(november).toMatchObject({
      complete: true,
      status: "estimated",
      annualPayments: { totalCents: 75000 },
      estimatedGrossCents: 283000,
    });
  });
  it("propagates missing tariff annual facts into the shared result without hiding known base pay", () => {
    const result = calculateDatedMonthlyRemuneration({
      ...input("2026-11", [history()]),
      allowanceEntitlements: [
        {
          from: "2026-11-01",
          through: "2026-11-30",
          status: "NONE",
          origin: "confirmed",
          revision: 1,
        },
      ],
    });
    expect(result.base.totalCents).toBeGreaterThan(0);
    expect(result.annualPayments.complete).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.estimatedGrossCents).toBeNull();
    expect(result.knownSubtotalCents).toBeGreaterThan(0);
  });
  it("replaces an annual estimate with a confirmed actual in the later cash year", () => {
    const { pkg, claim } = tariffAnnualFixture();
    const saved: SavedTariffAnnualClaim = {
      claim,
      actualPayment: { grossCents: 255000, payoutMonth: "2027-01" },
      revoked: false,
      revision: 2,
      updatedAt: work.updatedAt,
    };
    const data = {
      ...input("2026-09", [own({ ...ownRemunerationFixture(), specialPayments: [] })]),
      resolver: resolver([pkg]),
      tariffAnnualClaims: [saved],
    };
    expect(
      calculateAssessedMonthlyRemuneration({ ...data, month: "2026-11" }).annualPayments.totalCents,
    ).toBe(0);
    const january = calculateAssessedMonthlyRemuneration({ ...data, month: "2027-01" });
    expect(january.annualPayments.totalCents).toBe(255000);
    expect(january.estimatedGrossCents).toBe(463000);
  });
});
