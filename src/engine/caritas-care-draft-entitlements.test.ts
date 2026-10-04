import { describe, expect, it } from "vitest";
import type { MonthlyAllowanceDecisions } from "@/domain/allowance-decisions";
import type { ScopedAllowanceDecision } from "@/domain/remuneration-assessment";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { deriveCaritasDraftEntitlements } from "./caritas-care-draft-entitlements";

const stamp = "2026-09-01T00:00:00Z";
const profile: DatedRemunerationProfile = {
  effectiveFrom: "2026-01-01",
  revision: 1,
  createdAt: stamp,
  updatedAt: stamp,
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: "avr-caritas-p-bw",
      variant: "ANLAGE_31",
      region: "BW",
      group: "p6",
      level: "1",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};

function decision(change: Partial<ScopedAllowanceDecision> = {}): ScopedAllowanceDecision {
  return {
    from: "2026-09-01",
    through: "2026-09-30",
    tariff: { packageId: "avr-caritas-p-bw", variant: "ANLAGE_31", region: "BW" },
    allowanceStatus: "NONE",
    revision: 1,
    confirmedAt: stamp,
    updatedAt: stamp,
    ...change,
  };
}

function month(
  decisions: readonly ScopedAllowanceDecision[] = [decision()],
  change: Partial<MonthlyAllowanceDecisions> = {},
): MonthlyAllowanceDecisions {
  return { month: "2026-09", revision: 1, updatedAt: stamp, decisions, ...change };
}

describe("Caritas draft entitlements from saved tariff-bound decisions", () => {
  it("accepts a complete confirmed NONE decision without inferring a legal allowance", () => {
    expect(deriveCaritasDraftEntitlements("2026-09", [profile], [month()])).toEqual({
      kind: "confirmed",
      entitlements: [
        {
          from: "2026-09-01",
          through: "2026-09-30",
          status: "NONE",
          origin: "confirmed",
          revision: 1,
        },
      ],
    });
  });

  it("preserves adjacent monthly and hourly segments", () => {
    const saved = month([
      decision({ through: "2026-09-14", allowanceStatus: "SHIFT_MONTHLY" }),
      decision({ from: "2026-09-15", allowanceStatus: "ALTERNATING_HOURLY" }),
    ]);
    expect(deriveCaritasDraftEntitlements("2026-09", [profile], [saved])).toMatchObject({
      kind: "confirmed",
      entitlements: [{ status: "SHIFT_MONTHLY" }, { status: "ALTERNATING_HOURLY" }],
    });
  });

  it("does not turn an unsaved, empty, or gapped month into zero allowance", () => {
    expect(deriveCaritasDraftEntitlements("2026-09", [profile], [])).toMatchObject({
      kind: "unavailable",
      reason: "DECISIONS_MISSING",
    });
    expect(
      deriveCaritasDraftEntitlements("2026-09", [profile], [month([], { revision: 1 })]),
    ).toMatchObject({ kind: "unavailable", reason: "DECISIONS_INCOMPLETE" });
    expect(
      deriveCaritasDraftEntitlements(
        "2026-09",
        [profile],
        [month([decision({ through: "2026-09-14" }), decision({ from: "2026-09-16" })])],
      ),
    ).toMatchObject({ kind: "unavailable", reason: "DECISIONS_INCOMPLETE" });
  });

  it("rejects stale, overlapping and tariff-mismatched confirmations", () => {
    expect(
      deriveCaritasDraftEntitlements(
        "2026-09",
        [profile],
        [month([decision({ revision: 1 })], { revision: 2 })],
      ),
    ).toMatchObject({ kind: "unavailable", reason: "DECISIONS_STALE" });
    expect(
      deriveCaritasDraftEntitlements(
        "2026-09",
        [profile],
        [month([decision({ through: "2026-09-15" }), decision({ from: "2026-09-15" })])],
      ),
    ).toMatchObject({ kind: "unavailable", reason: "DECISIONS_INVALID" });
    expect(
      deriveCaritasDraftEntitlements(
        "2026-09",
        [profile],
        [
          month([
            decision({
              tariff: { packageId: "avr-caritas-p-nord", variant: "ANLAGE_31", region: "NORD" },
            }),
          ]),
        ],
      ),
    ).toMatchObject({ kind: "unavailable", reason: "DECISIONS_TARIFF_MISMATCH" });
  });

  it("rejects a remuneration profile switch during the month", () => {
    expect(
      deriveCaritasDraftEntitlements(
        "2026-09",
        [profile, { ...profile, effectiveFrom: "2026-09-15" }],
        [month()],
      ),
    ).toMatchObject({ kind: "unavailable", reason: "PROFILE_MISSING_OR_SPLIT" });
  });
});
