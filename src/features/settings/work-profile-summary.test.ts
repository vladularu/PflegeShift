import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { datedSalarySummary } from "./work-profile-summary";
const dated = (group = "P5", from: string | null = "2026-01-01"): DatedRemunerationProfile => ({
  effectiveFrom: from,
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  data: {
    version: 1,
    weeklyMinutes: 2310,
    selection: {
      kind: "tariff",
      packageId: "tvoed-vka-bt-k",
      variant: "BT_K",
      region: "OTHER",
      group,
      level: "1",
      fullTimeWeeklyMinutes: 2310,
    },
  },
});
const summary = (profiles: readonly DatedRemunerationProfile[], date = "2026-10-04") =>
  datedSalarySummary(profiles, date, bundledRuleResolver);
describe("current dated salary summary", () => {
  it("does not invent a profile before its first effective date", () => {
    expect(summary([dated("P5", "2026-11-01")])).toEqual({
      label: "Gehalt noch nicht eingerichtet",
      tariff: false,
    });
  });
  it("keeps an imported amount hidden until its beginning is confirmed", () => {
    const entry = {
      ...dated("P5", null),
      data: { version: 1, selection: { kind: "own-monthly", monthlyGrossCents: 345000 } },
    } as DatedRemunerationProfile;
    expect(summary([entry])).toEqual({
      label: "Vergütung übernommen · Beginn noch bestätigen",
      tariff: false,
    });
  });
  it("selects each dated stand at its boundary without assuming the latest is current", () => {
    const profiles = [dated(), dated("P6", "2026-11-01")];
    expect(summary(profiles).label).toContain("P5");
    expect(summary(profiles, "2026-11-01").label).toContain("P6");
    expect(summary(profiles).tariff).toBe(true);
  });
  it("uses changed content even when the revision is unchanged after a restore", () => {
    expect(summary([dated("P5")]).label).toContain("P5");
    expect(summary([dated("P6")]).label).toContain("P6");
  });
  it("does not call an unavailable tariff basis usable", () => {
    expect(summary([dated()], "2027-04-01")).toEqual({
      label: "Gespeicherter Tarif · Berechnungsgrundlage offen · P5 · Stufe 1",
      tariff: false,
    });
  });
  it("does not present an incompatible group and stage as valid", () => {
    expect(summary([dated("P7")]).tariff).toBe(false);
    expect(summary([dated("P7")]).label).toContain("Berechnungsgrundlage offen");
  });
  it("keeps ambiguous history and invalid restored data unavailable", () => {
    expect(summary([dated(), dated("P6")])).toEqual({
      label: "Vergütungsstand nicht verfügbar",
      tariff: false,
    });
    expect(
      summary([{ ...dated(), data: { version: 99 } } as unknown as DatedRemunerationProfile]).label,
    ).toBe("Vergütungsstand nicht verfügbar");
  });
  it("labels a monthly own amount without claiming estimated total gross", () => {
    const entry = {
      ...dated(),
      data: {
        version: 1,
        weeklyMinutes: 2310,
        selection: { kind: "own-monthly", monthlyGrossCents: 345050 },
      },
    } as DatedRemunerationProfile;
    expect(summary([entry])).toEqual({
      label: "Eigenes Monatsentgelt · 3.450,50 €",
      tariff: false,
    });
  });
  it.each(["monthly", "hourly"] as const)("labels the actual configured %s base", (kind) => {
    const entry: DatedRemunerationProfile = {
      ...dated(),
      data: {
        version: 2,
        weeklyMinutes: 2310,
        selection: {
          kind: "own-configured",
          configuration: {
            base:
              kind === "monthly"
                ? { kind, personalCents: 200000, partialMonth: "unconfirmed" }
                : { kind, centsPerHour: 2500 },
            percentageBasisHourlyCents: null,
            timePremiums: null,
            overtime: null,
            fixedAllowances: [],
            specialPayments: [],
          },
        },
      },
    };
    expect(summary([entry]).label).toBe(
      kind === "monthly" ? "Eigenes Monatsentgelt · 2.000,00 €" : "Eigener Stundenlohn · 25,00 €",
    );
  });
});
