import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";
import type { AllowanceStatus } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftShiftAllowance,
  type CaritasDraftShiftInput,
} from "./caritas-care-draft-shift-allowance";

function candidate(region: "bw" | "ost" = "bw", year = 2026): RuleTariffPackage {
  const version = region === "ost" ? `${year}-01` : "2026-02-01";
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function decision(
  from: string,
  through: string,
  status: AllowanceStatus,
  origin: "confirmed" | "estimated" = "confirmed",
): DatedAllowanceEntitlement {
  return { from, through, status, origin, revision: 1 };
}

function input(status: AllowanceStatus, variantId = "ANLAGE_31"): CaritasDraftShiftInput {
  return {
    pkg: candidate(),
    from: "2026-02-01",
    through: "2026-02-28",
    variantId,
    regionId: "BW",
    weeklyMinutes: 1800,
    entitlements: [decision("2026-02-01", "2026-02-28", status)],
    workDaysComplete: true,
    workedDays: [],
  };
}

describe("Caritas care DRAFT shift allowance, confirmed entitlement only", () => {
  it("prorates the monthly alternating rate for agreed part-time hours", () => {
    const result = calculateCaritasCareDraftShiftAllowance(input("ALTERNATING_MONTHLY"));
    expect(result).toMatchObject({
      kind: "personal-shift-allowance",
      amountCents: 19231,
      status: "calculated",
      positions: [
        {
          allowanceStatus: "ALTERNATING_MONTHLY",
          rateCents: 25000,
          personalMonthlyCents: 19231,
          calendarDays: 28,
          amountCents: 19231,
        },
      ],
    });
  });

  it("uses separate Anlage 31/32 hourly rates on actual net hours without part-time reduction", () => {
    for (const [annex, expectedRate, expectedAmount] of [
      [31, 149, 1043],
      [32, 147, 1029],
    ] as const) {
      const facts = input("ALTERNATING_HOURLY", `ANLAGE_${annex}`);
      const result = calculateCaritasCareDraftShiftAllowance({
        ...facts,
        workedDays: [{ date: "2026-02-09", workedMinutes: 420, estimatedPause: false }],
      });
      expect(result).toMatchObject({
        kind: "personal-shift-allowance",
        amountCents: expectedAmount,
        positions: [{ rateCents: expectedRate, workedMinutes: 420, amountCents: expectedAmount }],
      });
    }
  });

  it("keeps monthly shift and alternating decisions exclusive within the month", () => {
    const facts = input("NONE");
    const result = calculateCaritasCareDraftShiftAllowance({
      ...facts,
      entitlements: [
        decision("2026-02-01", "2026-02-14", "ALTERNATING_MONTHLY"),
        decision("2026-02-15", "2026-02-28", "SHIFT_MONTHLY"),
      ],
    });
    expect(result).toMatchObject({
      kind: "personal-shift-allowance",
      amountCents: 13462,
      status: "estimated",
      positions: [{ amountCents: 9616 }, { amountCents: 3846 }],
    });
  });

  it("returns zero only for a confirmed NONE period and never infers eligibility", () => {
    expect(calculateCaritasCareDraftShiftAllowance(input("NONE"))).toMatchObject({
      kind: "personal-shift-allowance",
      amountCents: 0,
      positions: [],
    });
    expect(calculateCaritasCareDraftShiftAllowance({ ...input("NONE"), entitlements: [] })).toEqual(
      { kind: "unavailable", reason: "DECISION_MISSING" },
    );
    expect(
      calculateCaritasCareDraftShiftAllowance({
        ...input("SHIFT_MONTHLY"),
        entitlements: [decision("2026-02-01", "2026-02-28", "SHIFT_MONTHLY", "estimated")],
      }),
    ).toEqual({ kind: "unavailable", reason: "DECISION_MISSING" });
  });

  it("rejects overlapping decisions and duplicate or out-of-period workdays", () => {
    const facts = input("SHIFT_HOURLY");
    expect(
      calculateCaritasCareDraftShiftAllowance({
        ...facts,
        entitlements: [
          ...facts.entitlements,
          decision("2026-02-15", "2026-02-28", "ALTERNATING_HOURLY"),
        ],
      }),
    ).toEqual({ kind: "unavailable", reason: "DECISION_AMBIGUOUS" });
    const day = { date: "2026-02-09", workedMinutes: 420, estimatedPause: false };
    expect(calculateCaritasCareDraftShiftAllowance({ ...facts, workedDays: [day, day] })).toEqual({
      kind: "unavailable",
      reason: "INVALID_WORKED_MINUTES",
    });
    expect(calculateCaritasCareDraftShiftAllowance({ ...facts, workDaysComplete: false })).toEqual({
      kind: "unavailable",
      reason: "WORK_DATA_INCOMPLETE",
    });
  });

  it("marks estimated pause time and leaves unsupported historical rates unavailable", () => {
    expect(
      calculateCaritasCareDraftShiftAllowance({
        ...input("SHIFT_HOURLY"),
        workedDays: [{ date: "2026-02-09", workedMinutes: 420, estimatedPause: true }],
      }),
    ).toMatchObject({ kind: "personal-shift-allowance", status: "estimated", amountCents: 413 });
    expect(
      calculateCaritasCareDraftShiftAllowance({
        pkg: candidate("ost", 2025),
        from: "2025-01-01",
        through: "2025-01-31",
        variantId: "ANLAGE_31",
        regionId: "OST_TARIF_OST",
        weeklyMinutes: 1800,
        entitlements: [decision("2025-01-01", "2025-01-31", "SHIFT_MONTHLY")],
        workDaysComplete: true,
        workedDays: [],
      }),
    ).toEqual({ kind: "unavailable", reason: "MISSING_SHIFT_RATE" });
  });
});
