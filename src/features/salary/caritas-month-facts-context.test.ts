import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import { caritasMonthFactsContext } from "./caritas-month-facts-context";
const stamp = "2026-09-01T00:00:00Z";
function pkg(region = "bw"): RuleTariffPackage {
  const version = region === "ost" ? "2026-01" : "2026-02-01";
  return JSON.parse(
    readFileSync(
      new URL(
        `../../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}
function profile(value = pkg(), region = "BW", variant = "ANLAGE_31"): DatedRemunerationProfile {
  return {
    effectiveFrom: "2026-09-01",
    revision: 2,
    createdAt: stamp,
    updatedAt: stamp,
    data: {
      version: 1,
      weeklyMinutes: 1800,
      selection: {
        kind: "tariff",
        packageId: value.packageId,
        variant,
        region,
        group: "p6",
        level: "1",
        fullTimeWeeklyMinutes: 2340,
      },
    },
  };
}
const resolver = (...tariff: RuleTariffPackage[]) =>
  createRuleResolver({ tariff, legal: [], holiday: [] });
describe("Caritas month facts source binding", () => {
  it.each(
    ["ANLAGE_31", "ANLAGE_32"].flatMap((annex) =>
      [
        ["bw", "BW"],
        ["bayern", "BAYERN"],
        ["mitte", "MITTE"],
        ["nord", "NORD"],
        ["nrw", "NRW"],
        ["ost", "OST_TARIF_OST"],
        ["ost", "OST_TARIF_WEST_BERLIN"],
      ].map(([rk, territory]) => [annex, rk, territory]),
    ),
  )("keeps %s / %s / %s source identity", (annex, rk, territory) => {
    const source = pkg(rk);
    const selected = profile(source, territory, annex);
    expect(caritasMonthFactsContext("2026-09", [selected], resolver(source))).toMatchObject({
      profile: selected,
      packageId: source.packageId,
      ruleVersionId: source.versionId,
    });
  });
  it.each(["2026-13", "2026-9", "2026-09-01", ""])("rejects invalid month %s", (month) =>
    expect(caritasMonthFactsContext(month, [profile()], resolver(pkg()))).toBeNull(),
  );
  it("never borrows an undated, future, missing or ambiguous profile", () => {
    const selected = profile(),
      rules = resolver(pkg());
    for (const profiles of [
      [],
      [{ ...selected, effectiveFrom: null }],
      [{ ...selected, effectiveFrom: "2026-10-01" }],
      [selected, { ...selected }],
    ])
      expect(caritasMonthFactsContext("2026-09", profiles, rules)).toBeNull();
  });
  it("rejects even identical selection after a profile change inside the month", () => {
    const selected = profile();
    expect(
      caritasMonthFactsContext(
        "2026-09",
        [selected, { ...selected, effectiveFrom: "2026-09-15", revision: 3 }],
        resolver(pkg()),
      ),
    ).toBeNull();
  });
  it("rejects missing, ambiguous and midmonth-changing source versions", () => {
    const source = pkg(),
      selected = profile(source);
    expect(caritasMonthFactsContext("2026-09", [selected], resolver())).toBeNull();
    expect(
      caritasMonthFactsContext("2026-09", [selected], resolver(source, structuredClone(source))),
    ).toBeNull();
    const old = { ...source, validTo: "2026-09-14" };
    const next = { ...source, versionId: "2026-09-15-draft1", validFrom: "2026-09-15" };
    expect(caritasMonthFactsContext("2026-09", [selected], resolver(old, next))).toBeNull();
  });
  it("rejects mismatched region, annex, group and absent group-stage tuple", () => {
    const selected = profile();
    if (selected.data.selection.kind !== "tariff") throw Error("fixture");
    for (const change of [
      { region: "NRW" },
      { variant: "ANLAGE_33" },
      { group: "p99" },
      { group: "p7", level: "1" },
    ]) {
      expect(
        caritasMonthFactsContext(
          "2026-09",
          [
            {
              ...selected,
              data: { ...selected.data, selection: { ...selected.data.selection, ...change } },
            },
          ],
          resolver(pkg()),
        ),
      ).toBeNull();
    }
  });
  it("rejects invalid stored data, non-Caritas selection and a source with another contract", () => {
    const selected = profile(),
      source = pkg();
    expect(
      caritasMonthFactsContext(
        "2026-09",
        [
          {
            ...selected,
            data: { ...selected.data, version: 99 },
          } as unknown as DatedRemunerationProfile,
        ],
        resolver(source),
      ),
    ).toBeNull();
    expect(
      caritasMonthFactsContext(
        "2026-09",
        [
          {
            ...selected,
            data: {
              version: 1,
              weeklyMinutes: 1800,
              selection: { kind: "own-monthly", monthlyGrossCents: 320000 },
            },
          },
        ],
        resolver(source),
      ),
    ).toBeNull();
    expect(
      caritasMonthFactsContext(
        "2026-09",
        [selected],
        resolver({ ...source, engineContractVersion: 13 }),
      ),
    ).toBeNull();
  });
  it("changes the form binding on restored profile content or source content at the same revision", () => {
    const source = pkg(),
      selected = profile();
    const original = caritasMonthFactsContext("2026-09", [selected], resolver(source))!;
    const restored = caritasMonthFactsContext(
      "2026-09",
      [{ ...selected, data: { ...selected.data, weeklyMinutes: 1200 } }],
      resolver(source),
    )!;
    expect(restored.bindingKey).not.toBe(original.bindingKey);
    const changed = structuredClone(source);
    changed.rules.payTables[0].entries[0].monthlyCents++;
    expect(caritasMonthFactsContext("2026-09", [selected], resolver(changed))!.bindingKey).not.toBe(
      original.bindingKey,
    );
  });
});
