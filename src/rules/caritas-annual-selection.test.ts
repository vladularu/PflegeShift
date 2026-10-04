import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { annualBasisMonth, tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { calculateCaritasAnnualDraftFromResolver } from "@/engine/caritas-annual-draft";
import { resolver } from "@/engine/remuneration-test-fixtures";
import type { RuleTariffPackage } from "./contracts.generated";
import { selectCaritasAnnualDraft } from "./tariff-annual-selection";

const regions = [
  ["bw", "BW"],
  ["bayern", "BAYERN"],
  ["mitte", "MITTE"],
  ["nord", "NORD"],
  ["nrw", "NRW"],
  ["ost", "OST_TARIF_WEST_BERLIN"],
] as const;
const regionalYears = regions.flatMap(([region, regionId]) =>
  ([2025, 2026] as const).map((year) => [region, regionId, year] as const),
);

function candidate(region: (typeof regions)[number][0], year: 2025 | 2026) {
  const version = region === "ost" ? `${year}-01` : year === 2025 ? "2025-07-01" : "2026-02-01";
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

function claimFor(pkg: RuleTariffPackage, region: string, year: 2025 | 2026) {
  const { claim } = tariffAnnualFixture();
  claim.version = 3;
  claim.year = year;
  claim.selection = {
    packageId: pkg.packageId,
    variant: "ANLAGE_31",
    region,
    group: "p7",
    confirmed: true,
    groupAtSeptember1Confirmed: true,
  };
  claim.employment.start = `${year}-01-01`;
  claim.basis.months = [7, 8, 9].map((month) =>
    annualBasisMonth(`${year}-${String(month).padStart(2, "0")}`),
  );
  return claim;
}

describe("Caritas annual draft selection from an injected rule catalog", () => {
  it.each(regionalYears)(
    "selects %s / %s / %i without a bundled fallback",
    (region, regionId, year) => {
      const pkg = candidate(region, year);
      const claim = claimFor(pkg, regionId, year);
      const selected = selectCaritasAnnualDraft(claim, resolver([pkg]));
      expect(selected.ok).toBe(true);
      if (selected.ok) expect(selected.package).toEqual(pkg);
      expect(calculateCaritasAnnualDraftFromResolver(resolver([pkg]), claim)).toMatchObject({
        draftOnly: true,
        status: "estimated",
        packageId: pkg.packageId,
        versionId: pkg.versionId,
        year,
        amountCents: 258_000,
      });
    },
  );

  it("keeps a missing year, region or catalog interface unavailable", () => {
    const pkg = candidate("bw", 2026);
    const claim = claimFor(pkg, "BW", 2026);
    const active = resolver([pkg]);
    expect(selectCaritasAnnualDraft(claim, resolver([]))).toEqual({
      ok: false,
      code: "CARITAS_ANNUAL_RULE_MISSING",
    });
    expect(
      selectCaritasAnnualDraft(claim, {
        resolveTariff: active.resolveTariff,
        resolveLegal: active.resolveLegal,
        resolveHoliday: active.resolveHoliday,
      }),
    ).toEqual({ ok: false, code: "CARITAS_ANNUAL_RULE_MISSING" });
    claim.selection.region = "OTHER";
    expect(selectCaritasAnnualDraft(claim, active)).toEqual({
      ok: false,
      code: "CARITAS_ANNUAL_RULE_MISSING",
    });
    claim.selection.region = "BW";
    claim.year = 2027;
    expect(calculateCaritasAnnualDraftFromResolver(active, claim)).toMatchObject({
      draftOnly: true,
      status: "unavailable",
      amountCents: null,
      missing: ["CARITAS_ANNUAL_RULE_MISSING"],
    });
  });

  it("rejects a malformed or wrongly scoped candidate rather than guessing", () => {
    const pkg = candidate("bw", 2026);
    const claim = claimFor(pkg, "BW", 2026);
    const malformed = structuredClone(pkg);
    malformed.rules.caritasAnnualPaymentPolicy!.rateBands[0].rateBasisPoints = 7600;
    expect(selectCaritasAnnualDraft(claim, resolver([malformed]))).toEqual({
      ok: false,
      code: "CARITAS_ANNUAL_RULE_INVALID",
    });
    const wrong = candidate("nrw", 2026);
    const adapter = {
      ...resolver([pkg]),
      annualTariffCandidates: () => [wrong],
    };
    expect(selectCaritasAnnualDraft(claim, adapter)).toEqual({
      ok: false,
      code: "CARITAS_ANNUAL_RULE_INVALID",
    });
    claim.version = 1;
    expect(selectCaritasAnnualDraft(claim, resolver([pkg]))).toEqual({
      ok: false,
      code: "CARITAS_ANNUAL_RULE_INVALID",
    });
  });

  it("retains equally sourced revisions without adding the estimate to a report", () => {
    const pkg = candidate("bw", 2026);
    const next = structuredClone(pkg);
    next.versionId = `${pkg.versionId}-r2`;
    const claim = claimFor(pkg, "BW", 2026);
    const selected = selectCaritasAnnualDraft(claim, resolver([pkg, next]));
    expect(selected.ok).toBe(true);
    if (selected.ok)
      expect(selected.versions.map((version) => version.versionId)).toEqual([
        next.versionId,
        pkg.versionId,
      ]);
  });
});
