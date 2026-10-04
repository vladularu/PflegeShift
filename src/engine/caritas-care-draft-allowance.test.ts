import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftAllowance,
  calculateCaritasCareDraftFixedAllowance,
} from "./caritas-care-draft-allowance";
import { roundRemunerationCents } from "./remuneration-money";

function load(region: string, version: string): RuleTariffPackage {
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

describe("Caritas DRAFT Pflegezulagen (§ 12(3)/(4), § 12a), not activated pay", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw"])(
    "uses both signed date bands and both annexes in RK %s",
    (region) => {
      for (const [version, date, expectedCents] of [
        ["2025-07-01", "2026-01-31", 13796],
        ["2026-02-01", "2026-02-01", 14182],
      ] as const) {
        const pkg = load(region, version);
        for (const annex of [31, 32]) {
          const fullTimeWeeklyMinutes =
            annex === 32 || ["bw", "mitte"].includes(region) ? 2340 : 2310;
          const input = [pkg, date, `ANLAGE_${annex}`, region.toUpperCase(), "P6", "1"] as const;
          expect(calculateCaritasCareDraftAllowance(...input, fullTimeWeeklyMinutes)).toMatchObject(
            {
              kind: "personal-care-allowance",
              provisionId: "SECTION_12_4",
              fullTimeMonthlyCents: expectedCents,
              personalMonthlyCents: expectedCents,
              fullTimeWeeklyMinutes,
              rateSourceIds: ["caritas-bk-2025-02-corrected", `caritas-rk-${region}-2025`],
            },
          );
          expect(calculateCaritasCareDraftAllowance(...input, 1800)).toMatchObject({
            kind: "personal-care-allowance",
            personalMonthlyCents: roundRemunerationCents(
              expectedCents * 1800,
              fullTimeWeeklyMinutes,
            ),
          });
          expect(pkg.rules.selection?.capabilities.allowances).toBe("UNSUPPORTED");
        }
      }
    },
  );

  it.each(["bw", "bayern", "mitte", "nord", "nrw"])(
    "keeps the independent 25/35-euro § 12(3) rate distinct in RK %s",
    (region) => {
      for (const [version, date] of [
        ["2025-07-01", "2025-07-01"],
        ["2026-02-01", "2026-12-31"],
      ] as const)
        for (const annex of [31, 32]) {
          const pkg = load(region, version);
          const fullTimeWeeklyMinutes =
            annex === 32 || ["bw", "mitte"].includes(region) ? 2340 : 2310;
          const cents = region === "bw" ? 3500 : 2500;
          const input = [pkg, date, `ANLAGE_${annex}`, region.toUpperCase(), "P6", "1"] as const;
          const full = calculateCaritasCareDraftFixedAllowance(...input, fullTimeWeeklyMinutes);
          expect(full).toMatchObject({
            kind: "personal-care-allowance",
            provisionId: "SECTION_12_3",
            fullTimeMonthlyCents: cents,
            personalMonthlyCents: cents,
            rateSourceIds: ["caritas-dg-2024-care-allowances"],
          });
          expect(calculateCaritasCareDraftFixedAllowance(...input, 1800)).toMatchObject({
            kind: "personal-care-allowance",
            personalMonthlyCents: roundRemunerationCents(cents * 1800, fullTimeWeeklyMinutes),
          });
          const second = calculateCaritasCareDraftAllowance(...input, fullTimeWeeklyMinutes);
          if (full.kind === "personal-care-allowance" && second.kind === "personal-care-allowance")
            expect(full.rateId).not.toBe(second.rateId);
        }
    },
  );

  it("keeps RK Ost's pre-July 2025 gap and February 2026 transition explicit", () => {
    for (const annex of [31, 32])
      for (const regionId of ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]) {
        const input = [`ANLAGE_${annex}`, regionId, "P6", "1", 1800] as const;
        expect(
          calculateCaritasCareDraftAllowance(load("ost", "2025-01"), "2025-06-30", ...input),
        ).toEqual({ kind: "unavailable", reason: "MISSING_CARE_ALLOWANCE_RATE" });
        expect(
          calculateCaritasCareDraftFixedAllowance(load("ost", "2025-01"), "2025-06-30", ...input),
        ).toMatchObject({
          kind: "personal-care-allowance",
          provisionId: "SECTION_12_3",
          fullTimeMonthlyCents: 2500,
          rateSourceIds: ["caritas-dg-2024-care-allowances"],
        });
        for (const [version, date, expectedCents] of [
          ["2025-01", "2025-07-01", 13796],
          ["2026-01", "2026-01-31", 13796],
          ["2026-01", "2026-02-01", 14182],
        ] as const)
          expect(
            calculateCaritasCareDraftAllowance(load("ost", version), date, ...input),
          ).toMatchObject({
            kind: "personal-care-allowance",
            fullTimeMonthlyCents: expectedCents,
            rateSourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-ost-2025-allowances"],
          });
      }
  });

  it("fails closed for invalid weekly time, selection, stage, date and tampered rates", () => {
    const pkg = load("bw", "2026-02-01");
    const calculate = (date: string, region: string, step: string, minutes: number) =>
      calculateCaritasCareDraftAllowance(pkg, date, "ANLAGE_31", region, "P7", step, minutes);
    expect(calculate("2026-02-01", "BW", "2", 2341)).toEqual({
      kind: "unavailable",
      reason: "INVALID_WEEKLY_TIME",
    });
    expect(calculate("2026-02-01", "OST_TARIF_OST", "2", 1800)).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(calculate("2026-02-01", "BW", "1", 1800)).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(calculate("2027-01-01", "BW", "2", 1800)).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    pkg.rules.caritasCareAllowanceRates![0].monthlyCents = 0;
    expect(calculate("2026-02-01", "BW", "2", 1800)).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
