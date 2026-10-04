import { describe, expect, it } from "vitest";
import { shift } from "@/engine/remuneration-test-fixtures";
import {
  isCurrentTvoedAnnexAPremiumFacts,
  tvoedAnnexAShiftBinding,
  validateSavedTvoedAnnexAPremiumFacts,
} from "./saved-tvoed-annex-a-premium-facts";

const parent = shift({
  id: "shift-20",
  date: "2026-09-20",
  type: "NIGHT",
  startTime: "21:00",
  endTime: "23:00",
  breakMinutes: 0,
});
const day = {
  shiftId: parent.id,
  date: parent.date,
  origin: "confirmed",
  shiftBinding: tvoedAnnexAShiftBinding(parent, "Europe/Berlin"),
  workKind: "REGULAR_ACTIVE",
  holidayTimeOff: null,
  shiftWork: true,
  legacyAngestellteClass: null,
} as const;
const record = {
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 2,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: "2026-05-01-draft1",
  variantId: "BT_K",
  regionId: "VKA",
  groupId: "eg9b",
  stepId: "s3",
  contractedWeeklyMinutes: 1920,
  comparableFullTimeWeeklyMinutes: 2340,
  timeZoneId: "Europe/Berlin",
  cashPaymentConfirmed: true,
  localAgreement: "NONE_CONFIRMED",
  dayDecisions: [day],
  revision: 1,
  confirmedAt: "2026-09-24T09:00:00.000Z",
  updatedAt: "2026-09-24T09:00:00.000Z",
} as const;

describe("TVöD Anlage A confirmed premium facts", () => {
  it("accepts a strict month, profile and shift-content binding", () => {
    const saved = validateSavedTvoedAnnexAPremiumFacts(record);
    expect(saved.dayDecisions).toEqual([day]);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(Object.isFrozen(saved.dayDecisions)).toBe(true);
    expect(Object.isFrozen(saved.dayDecisions[0])).toBe(true);
  });

  it("rejects an unrelated month, duplicate shift and unrecognized answers", () => {
    for (const change of [
      { month: "2026-10" },
      { packageId: "tvoed-p-vka" },
      { groupId: "p6" },
      { cashPaymentConfirmed: "yes" },
      { localAgreement: "assumed" },
      { ruleVersionId: "" },
      { profileRevision: 0 },
      { dayDecisions: [day, day] },
      { dayDecisions: [{ ...day, date: "2026-09-21" }] },
      { extra: true },
    ])
      expect(() => validateSavedTvoedAnnexAPremiumFacts({ ...record, ...change })).toThrow();
  });

  it("rejects a stale or forged shift binding", () => {
    for (const badBinding of [
      "not-json",
      JSON.stringify(["other", ...JSON.parse(day.shiftBinding).slice(1)]),
      JSON.stringify([parent.id, 0, ...JSON.parse(day.shiftBinding).slice(2)]),
      tvoedAnnexAShiftBinding({ ...parent, date: "2026-09-21" }, "Europe/Berlin"),
      tvoedAnnexAShiftBinding(parent, "UTC"),
    ])
      expect(() =>
        validateSavedTvoedAnnexAPremiumFacts({
          ...record,
          dayDecisions: [{ ...day, shiftBinding: badBinding }],
        }),
      ).toThrow();
  });

  it("binds both work dates of an overnight shift without merging their answers", () => {
    const night = shift({ ...parent, endTime: "07:00" });
    const binding = tvoedAnnexAShiftBinding(night, "Europe/Berlin");
    const saved = validateSavedTvoedAnnexAPremiumFacts({
      ...record,
      dayDecisions: [
        { ...day, shiftBinding: binding },
        { ...day, date: "2026-09-21", shiftBinding: binding, holidayTimeOff: false },
      ],
    });
    expect(saved.dayDecisions.map((item) => item.date)).toEqual(["2026-09-20", "2026-09-21"]);
    expect(() =>
      validateSavedTvoedAnnexAPremiumFacts({
        ...record,
        dayDecisions: [{ ...day, date: "2026-09-22", shiftBinding: binding }],
      }),
    ).toThrow();
  });

  it("uses the new month work date for a shift that started the previous month", () => {
    const prior = shift({ ...parent, id: "august-night", date: "2026-08-31", endTime: "07:00" });
    const saved = validateSavedTvoedAnnexAPremiumFacts({
      ...record,
      dayDecisions: [
        {
          ...day,
          shiftId: prior.id,
          date: "2026-09-01",
          shiftBinding: tvoedAnnexAShiftBinding(prior, "Europe/Berlin"),
        },
      ],
    });
    expect(saved.dayDecisions[0]?.date).toBe("2026-09-01");
    expect(() =>
      validateSavedTvoedAnnexAPremiumFacts({
        ...record,
        dayDecisions: [
          {
            ...day,
            shiftId: prior.id,
            date: prior.date,
            shiftBinding: tvoedAnnexAShiftBinding(prior, "Europe/Berlin"),
          },
        ],
      }),
    ).toThrow();
  });

  it.each([true, false, null])("keeps the explicit tri-state decision %s", (answer) => {
    const saved = validateSavedTvoedAnnexAPremiumFacts({
      ...record,
      cashPaymentConfirmed: answer,
      dayDecisions: [
        {
          ...day,
          holidayTimeOff: answer,
          shiftWork: answer,
          legacyAngestellteClass: answer,
          workKind: null,
        },
      ],
    });
    expect(saved.cashPaymentConfirmed).toBe(answer);
    expect(saved.dayDecisions[0]).toMatchObject({
      workKind: null,
      holidayTimeOff: answer,
      shiftWork: answer,
      legacyAngestellteClass: answer,
    });
  });

  it.each([
    { effectiveFrom: "2026-08-01" },
    { revision: 3 },
    { selection: { packageId: "tvoed-p-vka" } },
    { selection: { variant: "BT_B" } },
    { selection: { region: "OTHER" } },
    { selection: { group: "EG9c" } },
    { selection: { level: "4" } },
    { selection: { fullTimeWeeklyMinutes: 2400 } },
    { weeklyMinutes: 1800 },
  ])("rejects the changed profile binding %j", (change) => {
    const saved = validateSavedTvoedAnnexAPremiumFacts(record);
    const base = {
      effectiveFrom: record.profileEffectiveFrom,
      revision: record.profileRevision,
      createdAt: record.confirmedAt,
      updatedAt: record.updatedAt,
      data: {
        version: 1 as const,
        weeklyMinutes: 1920,
        selection: {
          kind: "tariff" as const,
          packageId: record.packageId,
          variant: record.variantId,
          region: record.regionId,
          group: "EG9b",
          level: "3",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    };
    expect(isCurrentTvoedAnnexAPremiumFacts(saved, base, record.ruleVersionId)).toBe(true);
    expect(isCurrentTvoedAnnexAPremiumFacts(saved, base, "new-rule")).toBe(false);
    const changed = {
      ...base,
      ...("effectiveFrom" in change ? { effectiveFrom: change.effectiveFrom } : {}),
      ...("revision" in change ? { revision: change.revision } : {}),
      data: {
        ...base.data,
        ...("weeklyMinutes" in change ? { weeklyMinutes: change.weeklyMinutes } : {}),
        selection: { ...base.data.selection, ...("selection" in change ? change.selection : {}) },
      },
    };
    expect(isCurrentTvoedAnnexAPremiumFacts(saved, changed, record.ruleVersionId)).toBe(false);
  });

  it("does not invent a second work day for an exact midnight ending", () => {
    const binding = tvoedAnnexAShiftBinding({ ...parent, endTime: "00:00" }, "Europe/Berlin");
    expect(() =>
      validateSavedTvoedAnnexAPremiumFacts({
        ...record,
        dayDecisions: [{ ...day, shiftBinding: binding, date: "2026-09-21" }],
      }),
    ).toThrow();
  });

  it.each([256, 257])("bounds the stored decision list at %i records", (count) => {
    const decisions = Array.from({ length: count }, (_, i) => {
      const item = { ...parent, id: "shift-" + i };
      return {
        ...day,
        shiftId: item.id,
        shiftBinding: tvoedAnnexAShiftBinding(item, "Europe/Berlin"),
      };
    });
    if (count === 256)
      expect(
        validateSavedTvoedAnnexAPremiumFacts({ ...record, dayDecisions: decisions }).dayDecisions,
      ).toHaveLength(256);
    else
      expect(() =>
        validateSavedTvoedAnnexAPremiumFacts({ ...record, dayDecisions: decisions }),
      ).toThrow();
  });
});
