import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MonthlyAllowanceDecisions } from "@/domain/allowance-decisions";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { validateSavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { validateSavedCaritasMonthFacts } from "@/domain/saved-caritas-month-facts";
import { work, resolver } from "@/engine/remuneration-test-fixtures";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { saveMonthlyAllowanceDecisions } from "@/infrastructure/database/allowance-decision-repository";
import { saveCaritasMonthFacts } from "@/infrastructure/database/caritas-month-facts-repository";
import { saveDatedRemunerationProfile } from "@/infrastructure/database/remuneration-profile-repository";
import { saveTariffAnnualClaim } from "@/infrastructure/database/tariff-annual-claim-repository";
import { TariffAnnualTestDatabase } from "@/infrastructure/database/tariff-annual-test-database";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasDraftCandidateFromSnapshot,
  loadCaritasDraftCandidate,
} from "./caritas-draft-candidate";

const pkg = JSON.parse(
  readFileSync(
    new URL(
      "../../rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as RuleTariffPackage;

function regionalPackage(region: string): RuleTariffPackage {
  const version = region === "ost" ? "2026-01" : "2026-02-01";
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
const stamp = "2026-09-01T00:00:00Z";
const profile: DatedRemunerationProfile = {
  effectiveFrom: "2026-09-01",
  revision: 1,
  createdAt: stamp,
  updatedAt: stamp,
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: pkg.packageId,
      variant: "ANLAGE_31",
      region: "BW",
      group: "p6",
      level: "1",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};
const allowance: MonthlyAllowanceDecisions = {
  month: "2026-09",
  revision: 1,
  updatedAt: stamp,
  decisions: [
    {
      from: "2026-09-01",
      through: "2026-09-30",
      tariff: { packageId: pkg.packageId, variant: "ANLAGE_31", region: "BW" },
      allowanceStatus: "NONE",
      revision: 1,
      confirmedAt: stamp,
      updatedAt: stamp,
    },
  ],
};
const facts = validateSavedCaritasMonthFacts({
  month: "2026-09",
  profileEffectiveFrom: profile.effectiveFrom,
  profileRevision: profile.revision,
  packageId: pkg.packageId,
  ruleVersionId: pkg.versionId,
  variantId: "ANLAGE_31",
  regionId: "BW",
  fullMonthEmploymentConfirmed: true,
  fullMonthlyBaseEntitlementConfirmed: true,
  fixedAllowanceClaim: "NOT_ENTITLED",
  careAllowanceClaim: "NOT_ENTITLED",
  localAgreement: "NONE_CONFIRMED",
  revision: 1,
  confirmedAt: stamp,
  updatedAt: stamp,
});

function annualClaim(actualCents: number, payoutMonth = "2026-09") {
  const { claim } = tariffAnnualFixture();
  claim.version = 3;
  claim.selection.packageId = pkg.packageId;
  claim.selection.variant = "ANLAGE_31";
  claim.selection.region = "BW";
  claim.selection.group = "p6";
  claim.selection.groupAtSeptember1Confirmed = true;
  return validateSavedTariffAnnualClaim({
    claim,
    actualPayment: { grossCents: actualCents, payoutMonth },
    revoked: false,
    revision: 1,
    updatedAt: stamp,
  });
}

type Snapshot = Parameters<typeof calculateCaritasDraftCandidateFromSnapshot>[0];
function snapshot(change: Partial<Snapshot> = {}): Snapshot {
  return {
    profile: work,
    shifts: [],
    pauseDetails: [],
    remunerationProfiles: [profile],
    allowanceDecisions: [allowance],
    overtimeAllocations: [],
    overtimeConfirmations: [],
    monthFacts: [facts],
    workDayConfirmations: [],
    tariffAnnualClaims: [],
    entriesComplete: true,
    historyComplete: true,
    ...change,
  };
}

describe("Caritas candidate from a persisted snapshot", () => {
  it.each([
    ["bw", "BW", 2340],
    ["bayern", "BAYERN", 2310],
    ["mitte", "MITTE", 2340],
    ["nord", "NORD", 2310],
    ["nrw", "NRW", 2310],
    ["ost", "OST_TARIF_OST", 2310],
  ])(
    "keeps %s/%s tariff identity through the persisted candidate path",
    (region, regionId, weeklyMinutes) => {
      const localPackage = regionalPackage(region);
      const localProfile: DatedRemunerationProfile = {
        ...profile,
        data: {
          version: 1,
          weeklyMinutes,
          selection: {
            kind: "tariff",
            packageId: localPackage.packageId,
            variant: "ANLAGE_31",
            region: regionId,
            group: "p6",
            level: "1",
            fullTimeWeeklyMinutes: weeklyMinutes,
          },
        },
      };
      const localAllowance: MonthlyAllowanceDecisions = {
        ...allowance,
        decisions: [
          {
            ...allowance.decisions[0],
            tariff: { packageId: localPackage.packageId, variant: "ANLAGE_31", region: regionId },
          },
        ],
      };
      const localFacts = validateSavedCaritasMonthFacts({
        ...facts,
        packageId: localPackage.packageId,
        ruleVersionId: localPackage.versionId,
        regionId,
      });
      const result = calculateCaritasDraftCandidateFromSnapshot(
        snapshot({
          remunerationProfiles: [localProfile],
          allowanceDecisions: [localAllowance],
          monthFacts: [localFacts],
        }),
        "2026-09",
        resolver([localPackage]),
      );
      expect(result).toMatchObject({
        kind: "draft-known-subtotal",
        monthly: { packageId: localPackage.packageId, versionId: localPackage.versionId },
      });
    },
  );

  it("stops before pay calculation when the work profile is absent", () => {
    expect(
      calculateCaritasDraftCandidateFromSnapshot(
        snapshot({ profile: null }),
        "2026-09",
        resolver([pkg]),
      ),
    ).toEqual({ kind: "unavailable", stage: "work-profile", reason: "PROFILE_MISSING" });
  });

  it("keeps a no-overtime result explicitly partial, not regular gross pay", () => {
    const result = calculateCaritasDraftCandidateFromSnapshot(
      snapshot(),
      "2026-09",
      resolver([pkg]),
    );
    expect(result).toMatchObject({
      kind: "draft-known-subtotal",
      status: "estimated",
      completeGross: false,
      excludedComponents: ["ANNUAL_PAYMENT_UNCONFIRMED", "OTHER_LOCAL_TERMS"],
      monthly: { kind: "draft-known-subtotal", packageId: pkg.packageId },
      overtime: { kind: "draft-confirmed-payouts", cashSubtotalCents: 0 },
      annual: { kind: "draft-known-payments", knownSubtotalCents: 0, complete: false },
    });
    if (result.kind !== "draft-known-subtotal") throw new Error("candidate unavailable");
    expect(result.knownSubtotalCents).toBe(result.monthly.knownSubtotalCents);
  });

  it("adds only the saved annual cash position while keeping unknown claims explicit", () => {
    const result = calculateCaritasDraftCandidateFromSnapshot(
      snapshot({ tariffAnnualClaims: [annualClaim(270_000)] }),
      "2026-09",
      resolver([pkg]),
    );
    if (result.kind !== "draft-known-subtotal") throw new Error("candidate unavailable");
    expect(result.annual).toMatchObject({
      knownSubtotalCents: 270_000,
      complete: false,
      positions: [{ origin: "actual", amountCents: 270_000 }],
    });
    expect(result.knownSubtotalCents).toBe(result.monthly.knownSubtotalCents + 270_000);
    expect(result.completeGross).toBe(false);
  });

  it("keeps delayed Caritas cash after switching to own remuneration without inventing monthly pay", () => {
    const ownProfile: DatedRemunerationProfile = {
      ...profile,
      effectiveFrom: "2027-01-01",
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: { kind: "own-monthly", monthlyGrossCents: 350_000 },
      },
    };
    const result = calculateCaritasDraftCandidateFromSnapshot(
      snapshot({
        remunerationProfiles: [profile, ownProfile],
        tariffAnnualClaims: [annualClaim(270_000, "2027-01")],
      }),
      "2027-01",
      resolver([pkg]),
    );
    expect(result).toMatchObject({
      kind: "draft-known-cash",
      knownSubtotalCents: 270_000,
      completeGross: false,
      excludedComponents: ["MONTHLY_PAY", "ANNUAL_PAYMENT_UNCONFIRMED", "OTHER_LOCAL_TERMS"],
      monthly: {
        kind: "unavailable",
        stage: "allowance-decisions",
        reason: "PROFILE_MISSING_OR_SPLIT",
      },
      annual: { positions: [{ amountCents: 270_000, origin: "actual", payoutMonth: "2027-01" }] },
    });
  });

  it("retains a saved cash payment when monthly facts are missing, including a confirmed zero", () => {
    const result = calculateCaritasDraftCandidateFromSnapshot(
      snapshot({ monthFacts: [], tariffAnnualClaims: [annualClaim(0)] }),
      "2026-09",
      resolver([pkg]),
    );
    expect(result).toMatchObject({
      kind: "draft-known-cash",
      knownSubtotalCents: 0,
      completeGross: false,
      excludedComponents: ["MONTHLY_PAY", "ANNUAL_PAYMENT_UNCONFIRMED", "OTHER_LOCAL_TERMS"],
      monthly: { kind: "unavailable", stage: "monthly-pay" },
      annual: { positions: [{ amountCents: 0, origin: "actual" }] },
    });
  });

  it("blocks an incomplete allowance decision before calculating base pay", () => {
    expect(
      calculateCaritasDraftCandidateFromSnapshot(
        snapshot({ allowanceDecisions: [] }),
        "2026-09",
        resolver([pkg]),
      ),
    ).toEqual({
      kind: "unavailable",
      stage: "allowance-decisions",
      reason: "DECISIONS_MISSING",
    });
  });

  it("retains the known monthly subtotal while disclosing unavailable overtime", () => {
    const result = calculateCaritasDraftCandidateFromSnapshot(
      snapshot({ historyComplete: false }),
      "2026-09",
      resolver([pkg]),
    );
    expect(result).toMatchObject({
      kind: "draft-known-subtotal",
      excludedComponents: ["OVERTIME", "ANNUAL_PAYMENT_UNCONFIRMED", "OTHER_LOCAL_TERMS"],
      overtime: { kind: "unavailable", reason: "HISTORY_INCOMPLETE" },
    });
  });

  it("loads a real SQLite profile, confirmed decisions and facts through the application entry point", async () => {
    const adapter = new TariffAnnualTestDatabase();
    await adapter.setup();
    try {
      const db = adapter.db;
      const savedProfile = await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        expectedRevision: 0,
        data: profile.data,
      });
      if (savedProfile.effectiveFrom === null) throw new Error("dated profile missing");
      await saveMonthlyAllowanceDecisions(db, {
        month: "2026-09",
        expectedRevision: 0,
        decisions: [
          {
            from: "2026-09-01",
            through: "2026-09-30",
            tariff: allowance.decisions[0].tariff,
            allowanceStatus: "NONE",
          },
        ],
      });
      await saveCaritasMonthFacts(db, {
        month: "2026-09",
        profileEffectiveFrom: savedProfile.effectiveFrom,
        expectedProfileRevision: savedProfile.revision,
        ruleVersionId: pkg.versionId,
        fullMonthEmploymentConfirmed: true,
        fullMonthlyBaseEntitlementConfirmed: true,
        fixedAllowanceClaim: "NOT_ENTITLED",
        careAllowanceClaim: "NOT_ENTITLED",
        localAgreement: "NONE_CONFIRMED",
        expectedRevision: 0,
      });
      expect(await loadCaritasDraftCandidate(db, "2026-09", resolver([pkg]))).toMatchObject({
        kind: "draft-known-subtotal",
        completeGross: false,
        monthly: { kind: "draft-known-subtotal", packageId: pkg.packageId },
        overtime: { kind: "draft-confirmed-payouts", cashSubtotalCents: 0 },
      });
      const laterAnnual = annualClaim(270_000, "2027-01");
      await saveTariffAnnualClaim(db, {
        claim: laterAnnual.claim,
        actualPayment: laterAnnual.actualPayment,
        expected: null,
      });
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2027-01-01",
        expectedRevision: 0,
        data: {
          version: 1,
          weeklyMinutes: 2340,
          selection: { kind: "own-monthly", monthlyGrossCents: 350_000 },
        },
      });
      expect(await loadCaritasDraftCandidate(db, "2027-01", resolver([pkg]))).toMatchObject({
        kind: "draft-known-cash",
        knownSubtotalCents: 270_000,
        completeGross: false,
        annual: { positions: [{ origin: "actual", payoutMonth: "2027-01" }] },
      });
    } finally {
      adapter.database.close();
    }
  });
});
