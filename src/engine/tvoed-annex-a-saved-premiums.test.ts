import { describe, expect, it } from "vitest";
import candidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { validateSavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import {
  tvoedAnnexAShiftBinding,
  validateSavedTvoedAnnexAPremiumFacts,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import { validateSavedShiftTraining } from "@/domain/training-data";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { shift, work } from "./remuneration-test-fixtures";

const resolver = createRuleResolver({
  tariff: [candidate as RuleTariffPackage],
  legal: BUNDLED_LEGAL_RULES,
  holiday: BUNDLED_HOLIDAY_RULES,
});
const profile: DatedRemunerationProfile = {
  effectiveFrom: "2026-05-01",
  revision: 1,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: "tvoed-vka-anlage-a",
      variant: "BT_K",
      region: "VKA",
      group: "EG9B",
      level: "3",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};
const parent = shift({
  id: "annex-a-sunday",
  date: "2026-09-20",
  type: "NIGHT",
  startTime: "21:00",
  endTime: "23:00",
  breakMinutes: 0,
});
const confirmation = validateSavedTvoedAnnexAMonthConfirmation({
  month: "2026-09",
  profileEffectiveFrom: profile.effectiveFrom,
  profileRevision: profile.revision,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: candidate.versionId,
  variantId: "BT_K",
  regionId: "VKA",
  groupId: "eg9b",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  comparableFullTimeWeeklyMinutes: 2340,
  applicabilityConfirmed: true,
  comparableFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: true,
  revision: 1,
  confirmedAt: "2026-09-24T09:00:00.000Z",
  updatedAt: "2026-09-24T09:00:00.000Z",
});
const facts = validateSavedTvoedAnnexAPremiumFacts({
  month: "2026-09",
  profileEffectiveFrom: profile.effectiveFrom,
  profileRevision: profile.revision,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: candidate.versionId,
  variantId: "BT_K",
  regionId: "VKA",
  groupId: "eg9b",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  comparableFullTimeWeeklyMinutes: 2340,
  timeZoneId: "Europe/Berlin",
  cashPaymentConfirmed: true,
  localAgreement: "NONE_CONFIRMED",
  dayDecisions: [
    {
      shiftId: parent.id,
      date: parent.date,
      origin: "confirmed",
      shiftBinding: tvoedAnnexAShiftBinding(parent, work.timeZone),
      workKind: "REGULAR_ACTIVE",
      holidayTimeOff: null,
      shiftWork: null,
      legacyAngestellteClass: null,
    },
  ],
  revision: 1,
  confirmedAt: "2026-09-24T09:00:00.000Z",
  updatedAt: "2026-09-24T09:00:00.000Z",
});
const pause = validateSavedShiftTraining({
  shiftId: parent.id,
  shiftRevision: parent.revision,
  shiftDate: parent.date,
  shiftUpdatedAt: parent.updatedAt,
  timeZone: work.timeZone,
  data: { version: 1, pauses: [], school: null },
  revision: 1,
  updatedAt: parent.updatedAt,
});

function monthly(overrides: Partial<Parameters<typeof calculateDatedMonthlyRemuneration>[0]> = {}) {
  return calculateDatedMonthlyRemuneration({
    month: "2026-09",
    shifts: [parent],
    workProfile: work,
    history: [profile],
    allowanceEntitlements: [],
    savedAnnexAConfirmations: [confirmation],
    savedAnnexAPremiumFacts: [facts],
    annexAPauseDetails: [pause],
    annexAEntriesComplete: true,
    annexAPauseDetailsComplete: true,
    resolver,
    ...overrides,
  });
}

describe("confirmed TVöD Anlage A draft premiums in the monthly result", () => {
  it("adds only a labeled partial estimate from real net work, never a complete gross", () => {
    const result = monthly();
    expect(result.timePremiums).toMatchObject({
      status: "estimated",
      complete: true,
      netMinutes: 120,
      knownSubtotalCents: 2232,
      positions: [
        { label: "Nachtzuschlag (Entwurf)", amountCents: 992, shiftId: null },
        { label: "Sonntagszuschlag (Entwurf)", amountCents: 1240, shiftId: null },
      ],
    });
    expect(result.positions.filter((item) => item.kind === "time-premium")).toEqual(
      result.timePremiums.positions,
    );
    expect(result.complete).toBe(false);
    expect(result.estimatedGrossCents).toBeNull();
  });

  it("subtracts a confirmed pause at its real time instead of the old centered estimate", () => {
    const paused = { ...parent, breakMinutes: 30 };
    const actualPause = validateSavedShiftTraining({
      ...pause,
      data: {
        version: 1,
        pauses: [{ start: "2026-09-20T19:30:00Z", end: "2026-09-20T20:00:00Z" }],
        school: null,
      },
    });
    const result = monthly({
      shifts: [paused],
      annexAPauseDetails: [actualPause],
      savedAnnexAPremiumFacts: [
        {
          ...facts,
          dayDecisions: [
            {
              ...facts.dayDecisions[0],
              shiftBinding: tvoedAnnexAShiftBinding(paused, work.timeZone),
            },
          ],
        },
      ],
    });
    expect(result.timePremiums.netMinutes).toBe(90);
    expect(result.timePremiums.knownSubtotalCents).toBe(1674);
    expect(result.timePremiums.positions.map((item) => item.basis.pauseMethod)).toEqual([
      "confirmed-intervals",
      "confirmed-intervals",
    ]);
  });

  it("fails closed when contract, rule, shift, pauses or loaded snapshot are not current", () => {
    const cases: Partial<Parameters<typeof calculateDatedMonthlyRemuneration>[0]>[] = [
      { savedAnnexAConfirmations: [] },
      { savedAnnexAPremiumFacts: [{ ...facts, ruleVersionId: "other-version" }] },
      { savedAnnexAPremiumFacts: [{ ...facts, cashPaymentConfirmed: null }] },
      { shifts: [{ ...parent, startTime: "20:00" }] },
      { shifts: [] },
      { annexAPauseDetails: [] },
      { annexAEntriesComplete: false },
      { annexAPauseDetailsComplete: false },
    ];
    for (const change of cases) {
      const result = monthly(change);
      expect(result.timePremiums.knownSubtotalCents).toBe(0);
      expect(result.timePremiums.complete).toBe(false);
      expect(result.timePremiums.positions.some((item) => item.amountCents === null)).toBe(true);
      expect(result.estimatedGrossCents).toBeNull();
    }
  });

  it("does not turn deleted or extra stale service decisions into a confirmed zero", () => {
    const deleted = monthly({ shifts: [] });
    expect(deleted.timePremiums).toMatchObject({
      complete: false,
      totalCents: null,
      positions: [{ issue: { code: "DRAFT_PREMIUM_FACTS_INCOMPLETE" } }],
    });
    const other = shift({
      id: "formerly-worked",
      date: "2026-09-21",
      startTime: "09:00",
      endTime: "10:00",
    });
    const extra = {
      ...facts.dayDecisions[0],
      shiftId: other.id,
      date: other.date,
      shiftBinding: tvoedAnnexAShiftBinding(other, work.timeZone),
    };
    const stale = monthly({
      savedAnnexAPremiumFacts: [{ ...facts, dayDecisions: [...facts.dayDecisions, extra] }],
    });
    expect(stale.timePremiums.complete).toBe(false);
    expect(stale.timePremiums.knownSubtotalCents).toBe(0);
    expect(stale.timePremiums.positions[0].issue?.message).toMatch(/aktuellen Diensten/);
  });
});
