import { describe, expect, it } from "vitest";
import { history } from "@/engine/remuneration-test-fixtures";
import { annualBasisMonth, tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { validateTariffAnnualClaim } from "@/domain/tariff-annual-claim";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import {
  addTariffBasisMonth,
  newTariffAnnualClaim,
  prepareTariffAnnualClaim,
  reassignTariffAnnualClaim,
  tariffAnnualChoices,
  tariffAnnualDraft,
  tariffAnnualMonth,
  tariffAnnualSelectionKey,
} from "./tariff-annual-model";

function draft() {
  const selection = tariffAnnualChoices([history()], 2026)[0].selection;
  return tariffAnnualDraft({
    claim: newTariffAnnualClaim(2026, selection, []),
    saved: null,
    profilesToken: "[]",
  });
}
describe("tariff annual payment input model", () => {
  it("creates a separate Caritas V3 draft and preserves only its explicit historical confirmation", () => {
    const p = history();
    if (p.data.selection.kind !== "tariff") throw Error("expected tariff");
    const choice = tariffAnnualChoices(
      [
        {
          ...p,
          data: {
            ...p.data,
            selection: {
              ...p.data.selection,
              packageId: "avr-caritas-p-bw",
              variant: "ANLAGE_31",
              region: "BW",
              group: "P7",
            },
          },
        },
      ],
      2026,
    )[0];
    expect(choice.title).toContain("AVR-Caritas Pflege");
    expect(choice.key).toBe(tariffAnnualSelectionKey(choice.selection));
    const claim = newTariffAnnualClaim(2026, choice.selection, []);
    expect(claim).toMatchObject({
      version: 3,
      selection: { group: "p7", confirmed: false, groupAtSeptember1Confirmed: false },
    });
    const confirmed = validateTariffAnnualClaim({
      ...claim,
      selection: { ...claim.selection, confirmed: true, groupAtSeptember1Confirmed: true },
    });
    expect(tariffAnnualSelectionKey(confirmed.selection)).toBe(choice.key);
    expect(
      prepareTariffAnnualClaim(
        tariffAnnualDraft({ claim: confirmed, saved: null, profilesToken: "[]" }),
        null,
      ).claim,
    ).toEqual(confirmed);
    const reset = reassignTariffAnnualClaim(confirmed, choice.selection);
    expect(reset.selection.groupAtSeptember1Confirmed).toBe(false);
    const other = reassignTariffAnnualClaim(reset, tariffAnnualFixture().claim.selection);
    expect(other.version).toBe(1);
    expect(other.selection).not.toHaveProperty("groupAtSeptember1Confirmed");
  });
  it("creates and reassigns TV-L claims without inheriting a retirement confirmation", () => {
    const old = tariffAnnualFixture().claim;
    const selection = {
      ...old.selection,
      packageId: "tvl-kr-tdl",
      variant: "SECTION_43",
      region: "WEST_38_5",
      group: "kr9",
    };
    const claim = newTariffAnnualClaim(2026, selection, []);
    expect(claim).toMatchObject({ version: 2, exceptions: { tvlLegacyRetirementExit: null } });
    const confirmed = {
      ...claim,
      exceptions: { ...claim.exceptions, tvlLegacyRetirementExit: true },
    };
    expect(
      reassignTariffAnnualClaim(confirmed, selection).exceptions.tvlLegacyRetirementExit,
    ).toBeNull();
    const back = reassignTariffAnnualClaim(confirmed, old.selection);
    expect(back.version).toBe(1);
    expect(back.exceptions).not.toHaveProperty("tvlLegacyRetirementExit");
    const input = prepareTariffAnnualClaim(
      tariffAnnualDraft({ claim: confirmed, saved: null, profilesToken: "[]" }),
      null,
    );
    expect(input.claim.exceptions.tvlLegacyRetirementExit).toBe(true);
    const p = history();
    if (p.data.selection.kind !== "tariff") throw Error("expected tariff");
    const choices = tariffAnnualChoices(
      [
        {
          ...p,
          data: {
            ...p.data,
            selection: { ...p.data.selection, ...selection, kind: "tariff", group: "KR9" },
          },
        },
      ],
      2026,
    );
    expect(choices[0].selection.group).toBe("kr9");
    expect(choices[0].title).toContain("TV-L/KR");
  });
  it("starts unknown and never invents employment, entitlement, historical confirmation or amounts", () => {
    const input = prepareTariffAnnualClaim(draft(), null);
    expect(input.claim.selection.confirmed).toBe(false);
    expect(input.claim.employment).toMatchObject({ start: null, end: null, confirmed: false });
    expect(input.claim.entitlements).toHaveLength(12);
    expect(input.claim.entitlements.every((m) => m.reason === "UNKNOWN")).toBe(true);
    expect(input.claim.basis.months).toEqual([]);
    expect(input.actualPayment).toBeNull();
    expect(input.claim.allocation.required).toBeNull();
  });
  it("roundtrips every claim field and an actual zero without mutating the saved snapshot", () => {
    const { claim } = tariffAnnualFixture();
    claim.employment.end = "2026-12-31";
    claim.employment.takeover = { immediate: true, sameEmployer: false, employedDecember1: null };
    claim.exceptions = {
      birthYear: 2026,
      payBeforeParentalLeave: true,
      militaryReturnBeforeDecember1: false,
    };
    claim.allocation = { required: true, twelfthsNumerator: 13, twelfthsDenominator: 2 };
    claim.basis = {
      months: [
        annualBasisMonth("2026-07", 12345),
        { ...annualBasisMonth("2026-08", 0), variableCents: null },
      ],
      lastFullPayMonth: "2026-06",
      parentalPartTime: true,
      adjustedMonthlyCents: 23456,
      takeoverMonthlyCents: 0,
    };
    const saved: SavedTariffAnnualClaim = Object.freeze({
      claim: validateTariffAnnualClaim(claim),
      actualPayment: Object.freeze({ grossCents: 0, payoutMonth: "2027-01" }),
      revoked: true,
      revision: 3,
      updatedAt: "2026-12-01T00:00:00Z",
    });
    const d = tariffAnnualDraft({ claim: saved.claim, saved, profilesToken: "[]" });
    expect(d.start).toBe("01.01.2025");
    expect(d.payout).toBe("01.2027");
    const input = prepareTariffAnnualClaim(d, saved);
    expect(input.claim).toEqual(saved.claim);
    expect(input.actualPayment).toEqual(saved.actualPayment);
    expect(input.expected).toBe(saved);
    expect(saved.revoked).toBe(true);
  });
  it("offers only profiles overlapping the year, deduplicates levels and preserves distinct groups", () => {
    const profiles = [
      history("2027-01-01", "P8"),
      history("2026-05-01", "P6"),
      history("2025-01-01"),
      history("2026-07-01", "P6", 1155, "2"),
    ];
    expect(tariffAnnualChoices(profiles, 2026).map((c) => c.selection.group)).toEqual(["p5", "p6"]);
    expect(tariffAnnualChoices(profiles, 2024)).toEqual([]);
    expect(tariffAnnualChoices(profiles, 2027).map((c) => c.selection.group)).toEqual(["p8"]);
    expect(
      tariffAnnualChoices([{ ...history(), effectiveFrom: null }], 2020)[0].selection.confirmed,
    ).toBe(false);
  });
  it("keeps nulls distinct from explicit zero in a new basis month", () => {
    let d = addTariffBasisMonth(draft(), "02.2024");
    d = {
      ...d,
      months: [{ ...d.months[0], baseCents: "0", fixedCents: "12,34", paidCalendarDays: "29" }],
    };
    const m = prepareTariffAnnualClaim(d, null).claim.basis.months[0];
    expect(m).toEqual({
      month: "2024-02",
      componentsConfirmed: false,
      baseCents: 0,
      fixedCents: 1234,
      variableCents: null,
      scheduledOvertimeCents: null,
      paidCalendarDays: 29,
    });
    expect(() =>
      prepareTariffAnnualClaim(
        { ...d, months: [{ ...d.months[0], paidCalendarDays: "30" }] },
        null,
      ),
    ).toThrow(/Kalendertage/);
    expect(() => addTariffBasisMonth(d, "02.2024")).toThrow(/bereits/);
  });
  it.each(["13.2026", "1.2026", "01.1899", "01.4100", "2026-11", ""])(
    "rejects invalid month %s",
    (month) => {
      expect(() => tariffAnnualMonth(month, "Monat")).toThrow();
    },
  );
  it.each(["31.02.2026", "29.02.2025", "2026-01-01", "01.01.4100"])(
    "rejects invalid date %s",
    (start) => {
      expect(() => prepareTariffAnnualClaim({ ...draft(), start }, null)).toThrow(
        /Beschäftigungsbeginn/,
      );
    },
  );
  it("requires both actual amount and payout, allowing an explicit zero in the following year", () => {
    const d = { ...draft(), actual: true };
    expect(() => prepareTariffAnnualClaim(d, null)).toThrow(/Bruttobetrag/);
    expect(() => prepareTariffAnnualClaim({ ...d, actualAmount: "0" }, null)).toThrow(
      /Auszahlungsmonat/,
    );
    expect(
      prepareTariffAnnualClaim({ ...d, actualAmount: "0", payout: "01.2027" }, null).actualPayment,
    ).toEqual({ grossCents: 0, payoutMonth: "2027-01" });
    expect(
      prepareTariffAnnualClaim(
        { ...d, actual: false, actualAmount: "500", payout: "11.2026" },
        null,
      ).actualPayment,
    ).toBeNull();
  });
  it.each(["-1", "1e3", "2,345", "NaN", "10000000,01"])(
    "rejects unsupported amount %s",
    (actualAmount) => {
      expect(() =>
        prepareTariffAnnualClaim(
          { ...draft(), actual: true, actualAmount, payout: "11.2026" },
          null,
        ),
      ).toThrow();
    },
  );
  it("does not reuse revoked identifiers within a year", () => {
    const c = draft().claim;
    const saved = {
      claim: c,
      revoked: true,
      actualPayment: null,
      revision: 1,
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(newTariffAnnualClaim(2026, c.selection, [saved]).id).toBe("tariff-annual-2");
    expect(newTariffAnnualClaim(2027, c.selection, [saved]).id).toBe("tariff-annual-1");
  });
});
