import { describe, expect, it } from "vitest";
import { calculateAssessedMonthlyRemuneration } from "@/engine/remuneration-month";
import { history, resolver, shift, work } from "@/engine/remuneration-test-fixtures";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { calculateTariffAnnualPayments } from "@/engine/remuneration-tariff-annual";
import {
  remunerationBasis,
  remunerationEuro,
  remunerationIssues,
  remunerationPeriod,
} from "./remuneration-presentation";

function result() {
  return calculateAssessedMonthlyRemuneration({
    month: "2026-09",
    shifts: [shift({ breakMinutes: 30 })],
    workProfile: work,
    history: [history()],
    settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
    resolver: resolver(),
  });
}
describe("remuneration presentation", () => {
  it("explains full-hour estimation and the separate capped monthly offset without a fictitious part-time factor", () => {
    const original = result().allowances.positions[0];
    const burn = {
      ...original,
      amountCents: 1302,
      basis: {
        ...original.basis,
        ruleId: "tvl-part-iv:burn-month-full-hours",
        minutes: 449,
        rateCents: 186,
      },
    };
    const lines = remunerationBasis(burn);
    expect(lines).toContain("Monatliche Schätzung: 7 volle Stunden; 29 Restminuten");
    expect(lines).toContain("Katalogbetrag je voller Stunde: 1,86 €");
    expect(lines.some((line) => line.includes("fachlicher Prüfung"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Persönlicher Monatsbetrag"))).toBe(false);
    const offset = {
      ...burn,
      amountCents: -1302,
      basis: { ...burn.basis, ruleId: "tvl-part-iv:burn-month-offset" },
    };
    expect(remunerationBasis(offset)).toContain("Anrechnung: -13,02 €");
    expect(remunerationBasis(offset).some((line) => line.includes("Höchstens"))).toBe(true);
  });
  it("explains tariff basis, reference months, exact allocation and version provenance", () => {
    const { claim, pkg } = tariffAnnualFixture();
    claim.allocation = { required: true, twelfthsNumerator: 13, twelfthsDenominator: 2 };
    const row = {
      claim,
      actualPayment: null,
      revoked: false,
      revision: 3,
      updatedAt: work.updatedAt,
    };
    const position = calculateTariffAnnualPayments("2026-11", [row], resolver([pkg])).positions[0];
    const lines = remunerationBasis(position);
    expect(lines).toContain("Tarifliche Bemessungsgrundlage: 3.000,00 €");
    expect(lines).toContain("Anspruchsanteil: 13 ÷ 2 Zwölftel");
    expect(lines).toContain("Bemessungsmonate: 07.2026, 08.2026, 09.2026");
    expect(lines).toContain(`Regelfassungen: ${pkg.versionId}`);
    expect(lines.some((line) => line.startsWith("Jahresregel:"))).toBe(true);
  });
  it("does not attribute a confirmed actual payment to a current rule version", () => {
    const { claim, pkg } = tariffAnnualFixture();
    const row = {
      claim,
      actualPayment: { grossCents: 0, payoutMonth: "2027-01" },
      revoked: false,
      revision: 4,
      updatedAt: work.updatedAt,
    };
    const position = calculateTariffAnnualPayments("2027-01", [row], resolver([pkg])).positions[0];
    const lines = remunerationBasis(position);
    expect(lines).toContain("Anspruchsjahr: 2026");
    expect(lines.some((line) => line.includes("Revision 4"))).toBe(true);
    expect(
      lines.some((line) => line.startsWith("Regelfassungen:") || line.startsWith("Anteil:")),
    ).toBe(false);
    expect(position.source.requestedPackageId).toBeNull();
  });
  it("keeps unavailable amounts distinct from exact zero and formats integer cents only", () => {
    expect(remunerationEuro(null)).toBe("Nicht berechenbar");
    expect(remunerationEuro(0)).toBe("0,00 €");
    expect(remunerationEuro(290718)).toBe("2.907,18 €");
    expect(remunerationEuro(-123)).toBe("-1,23 €");
  });
  it("formats one-day and multi-day periods without inventing a month label", () => {
    expect(remunerationPeriod("2026-09-01", "2026-09-01")).toBe("01.09.2026");
    expect(remunerationPeriod("2026-09-01", "2026-09-15")).toBe("01.09.2026 – 15.09.2026");
  });
  it("shows personal and full-time bases separately", () => {
    const base = result().base.positions[0];
    expect(remunerationBasis(base)).toContain("Vollzeit-Monatsentgelt: 2.907,18 €");
    expect(remunerationBasis(base)).toContain("Persönliche Wochenstunden: 38,5");
  });
  it("shows rate, percentage, minutes and estimated pause for premiums", () => {
    const premium = result().timePremiums.positions.find(
      (position) => position.basis.ruleId !== null,
    )!;
    const lines = remunerationBasis(premium);
    expect(lines).toContain("Zuschlag: 20 %");
    expect(lines.some((line) => line.startsWith("Stundenbasis:"))).toBe(true);
    expect(lines).toContain("Pausenlage mangels genauer Angabe mittig geschätzt.");
    const actual = remunerationBasis({
      ...premium,
      basis: { ...premium.basis, pauseMethod: "confirmed-intervals" },
    });
    expect(actual).toContain("Tatsächliche Pausenintervalle berücksichtigt.");
    expect(actual).not.toContain("Pausenlage mangels genauer Angabe mittig geschätzt.");
  });
  it("deduplicates missing-data notices without dropping their causes", () => {
    const value = result();
    const messages = remunerationIssues(value);
    expect(messages.length).toBeGreaterThan(0);
    expect(new Set(messages).size).toBe(messages.length);
    for (const period of value.allowanceAssessment.periods)
      if (period.issue) expect(messages).toContain(period.issue.message);
  });
});
