import { describe, expect, it } from "vitest";
import candidateValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import type {
  DatedRemunerationProfile,
  RemunerationProfileData,
} from "@/domain/remuneration-profile";
import {
  BUNDLED_TARIFF_RULES,
  BUNDLED_LEGAL_RULES,
  BUNDLED_HOLIDAY_RULES,
  LEGACY_RULE_PACKAGE_IDS,
} from "@/rules/bundled-rules";
import { bundledRuleResolver, createRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { calculateMonthlyBaseRemuneration, roundRemunerationCents } from "./remuneration-base";
import { resolveRemunerationContext, resolveRemunerationMonth } from "./remuneration-context";

const candidate = candidateValue as RuleTariffPackage;
const data: RemunerationProfileData = {
  version: 1,
  weeklyMinutes: 2310,
  selection: {
    kind: "tariff",
    packageId: "tvoed-vka-bt-k",
    variant: "BT_K",
    region: "OTHER",
    group: "P5",
    level: "1",
    fullTimeWeeklyMinutes: 2310,
  },
};
function profile(
  effectiveFrom: string | null = "2026-01-01",
  value: RemunerationProfileData = data,
): DatedRemunerationProfile {
  return {
    effectiveFrom,
    data: value,
    revision: 1,
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
  };
}
function tariffData(
  overrides: Partial<Extract<RemunerationProfileData["selection"], { kind: "tariff" }>> = {},
  weeklyMinutes = 2310,
): RemunerationProfileData {
  if (data.selection.kind !== "tariff") throw new Error("fixture");
  return { ...data, weeklyMinutes, selection: { ...data.selection, ...overrides } };
}
function own(cents = 180050, weeklyMinutes = 1155): RemunerationProfileData {
  return {
    version: 1,
    weeklyMinutes,
    selection: { kind: "own-monthly", monthlyGrossCents: cents },
  };
}
function resolver(packages: readonly RuleTariffPackage[] = [candidate]): RuleResolver {
  return createRuleResolver({
    tariff: packages,
    legal: BUNDLED_LEGAL_RULES,
    holiday: BUNDLED_HOLIDAY_RULES,
  });
}
function changedTable(value: RuleTariffPackage, cents: number): RuleTariffPackage {
  return {
    ...value,
    rules: {
      ...value.rules,
      payTables: value.rules.payTables.map((table) => ({
        ...table,
        entries: table.entries.map((entry) =>
          entry.groupId === "p5" && entry.stepId === "s1"
            ? { ...entry, monthlyCents: cents }
            : entry,
        ),
      })) as RuleTariffPackage["rules"]["payTables"],
    },
  };
}

describe("dated monthly base remuneration", () => {
  it.each([
    ["P5", 1, 290718],
    ["P5", 2, 314633],
    ["P5", 3, 321662],
    ["P5", 4, 333409],
    ["P5", 5, 342222],
    ["P5", 6, 362925],
    ["P6", 1, 301249],
    ["P6", 2, 318741],
    ["P6", 3, 336347],
    ["P6", 4, 373795],
    ["P6", 5, 383341],
    ["P6", 6, 401341],
  ])(
    "resolves source-backed table selection %s/%s from the requested package",
    (group, level, cents) => {
      const result = calculateMonthlyBaseRemuneration(
        "2026-09",
        [profile("2026-01-01", tariffData({ group: String(group), level: String(level) }))],
        resolver(),
      );
      expect(result.totalCents).toBe(cents);
      expect(result.complete).toBe(true);
      expect(result.positions[0].source).toMatchObject({
        packageId: candidate.packageId,
        versionId: candidate.versionId,
        profileEffectiveFrom: "2026-01-01",
        profileRevision: 1,
      });
      expect(result.positions[0].source.references).toContainEqual(
        expect.objectContaining({ url: expect.stringContaining("vka.de") }),
      );
    },
  );
  it("keeps the personal own monthly amount without another part-time reduction", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [profile("2026-01-01", own())]);
    expect(result.totalCents).toBe(180050);
    expect(result.positions[0].basis).toMatchObject({
      personalMonthlyCents: 180050,
      weeklyMinutes: 1155,
      fullTimeWeeklyMinutes: null,
      proration: "none",
    });
  });
  it("uses package-specific weekly time, not a current fixed UI default", () => {
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [profile("2026-01-01", tariffData({ region: "KAV_BW" }, 1170))],
      resolver(),
    );
    expect(result.positions[0].basis.fullTimeWeeklyMinutes).toBe(2340);
    expect(result.totalCents).toBe(145359);
  });
  it("splits a mid-month group and part-time change without overwriting prior days", () => {
    const history = [profile("2026-09-16", tariffData({ group: "P6" }, 1155)), profile()];
    const frozen = structuredClone(history);
    const result = calculateMonthlyBaseRemuneration("2026-09", history, resolver());
    expect(result.positions.map((line) => [line.from, line.through, line.amountCents])).toEqual([
      ["2026-09-01", "2026-09-15", 145359],
      ["2026-09-16", "2026-09-30", 75313],
    ]);
    expect(result.totalCents).toBe(220672);
    expect(history).toEqual(frozen);
  });
  it("splits a rule version change even when the profile remains unchanged", () => {
    const before = { ...candidate, validTo: "2026-09-15" };
    const after = changedTable(
      { ...candidate, versionId: "synthetic-next", validFrom: "2026-09-16" },
      300000,
    );
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [profile()],
      resolver([before, after]),
    );
    expect(result.positions.map((line) => [line.source.versionId, line.amountCents])).toEqual([
      [candidate.versionId, 145359],
      ["synthetic-next", 150000],
    ]);
    expect(result.totalCents).toBe(295359);
  });
  it("keeps uncovered days unavailable and does not expose a partial amount as a full total", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [profile("2026-09-16")], resolver());
    expect(result.complete).toBe(false);
    expect(result.totalCents).toBeNull();
    expect(result.knownSubtotalCents).toBe(145359);
    expect(result.positions[0]).toMatchObject({
      from: "2026-09-01",
      through: "2026-09-15",
      amountCents: null,
      issue: { code: "PROFILE_MISSING" },
    });
  });
  it("does not turn a creation timestamp or an undated baseline into confirmed history", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [profile(null)]);
    expect(result.totalCents).toBeNull();
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].issue?.code).toBe("EFFECTIVE_DATE_UNKNOWN");
  });
  it("marks unconfigured, malformed and unknown-format profiles unavailable", () => {
    for (const [value, code] of [
      [{ ...data, selection: { kind: "unconfigured" } }, "REMUNERATION_UNCONFIGURED"],
      [{ ...data, version: 2 }, "PROFILE_INVALID"],
      [{ ...data, weeklyMinutes: 0 }, "PROFILE_INVALID"],
    ] as const) {
      const result = calculateMonthlyBaseRemuneration(
        "2026-09",
        [profile("2026-01-01", value as unknown as RemunerationProfileData)],
        resolver(),
      );
      expect(result.totalCents).toBeNull();
      expect(result.positions[0].issue?.code).toBe(code);
    }
  });
  it("never falls back to a different remote tariff track", () => {
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [profile()],
      resolver(BUNDLED_TARIFF_RULES),
    );
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("RULE_PACKAGE_NOT_FOUND");
  });
  it("uses the explicit embedded compatibility mapping and records its actual provenance", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [profile()], bundledRuleResolver);
    expect(result.totalCents).toBe(290718);
    expect(result.positions[0].source.packageId).toBe(LEGACY_RULE_PACKAGE_IDS.tariff);
  });
  it("does not extend the offline mapping to unknown identities", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [
      profile("2026-01-01", tariffData({ packageId: "unknown" })),
    ]);
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("RULE_PACKAGE_NOT_FOUND");
    expect(result.positions[0].source).toMatchObject({
      requestedPackageId: "unknown",
      packageId: null,
    });
  });
  it.each([
    ["2026-04", 282800],
    ["2026-05", 290718],
  ])("keeps historical bundled tables effective in %s", (month, cents) => {
    expect(calculateMonthlyBaseRemuneration(String(month), [profile()]).totalCents).toBe(cents);
  });
  it("does not extrapolate an expired embedded table", () => {
    const result = calculateMonthlyBaseRemuneration("2027-04", [profile()]);
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("RULE_PACKAGE_NOT_FOUND");
  });
  it("distinguishes an explicit zero from a missing table entry", () => {
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [profile()],
      resolver([changedTable(candidate, 0)]),
    );
    expect(result.totalCents).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.positions[0].issue).toBeNull();
  });
  it("does not claim a new tariff family is supported just because its table shape matches", () => {
    const other = { ...candidate, packageId: "new-family" };
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [profile("2026-01-01", tariffData({ packageId: other.packageId }))],
      resolver([other]),
    );
    expect(result.positions[0].issue?.code).toBe("TARIFF_UNSUPPORTED");
  });
  it.each([{ group: "P7", level: "1" }, { group: "P17" }, { level: "7" }])(
    "requires the selected combination to exist in the actual table %j",
    (selection) => {
      const result = calculateMonthlyBaseRemuneration(
        "2026-09",
        [profile("2026-01-01", tariffData(selection))],
        resolver(),
      );
      expect(result.positions[0].issue?.code).toBe("TABLE_ENTRY_MISSING");
      expect(result.totalCents).toBeNull();
    },
  );
  it("uses declared table entries rather than a global stage list", () => {
    const extended = structuredClone(candidate);
    // Synthetic metadata-free v3 isolates the table lookup; contract 11 also binds annual terms.
    extended.engineContractVersion = 3;
    delete extended.rules.selection;
    delete extended.rules.annualPaymentRules;
    extended.rules.payTables[0].entries.push({
      groupId: "p17",
      stepId: "s7",
      monthlyCents: 500000,
    });
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [profile("2026-01-01", tariffData({ group: "P17", level: "7" }))],
      resolver([extended]),
    );
    expect(result.totalCents).toBe(500000);
  });
  it.each([{ region: "unknown" }, { variant: "unknown" }, { level: "01" }, { group: "p5" }])(
    "does not normalize an incompatible selection %j",
    (selection) => {
      const result = calculateMonthlyBaseRemuneration(
        "2026-09",
        [profile("2026-01-01", tariffData(selection))],
        resolver(),
      );
      expect(result.positions[0].issue?.code).toBe("TABLE_SELECTION_INVALID");
    },
  );
  it("rejects package ambiguity, gaps and conflicting table entries", () => {
    expect(
      calculateMonthlyBaseRemuneration(
        "2026-09",
        [profile()],
        resolver([candidate, { ...candidate, versionId: "overlap" }]),
      ).positions[0].issue?.code,
    ).toBe("RULE_PACKAGE_AMBIGUOUS");
    const duplicate = structuredClone(candidate);
    const entry = duplicate.rules.payTables[0].entries.find(
      (item) => item.groupId === "p5" && item.stepId === "s1",
    )!;
    duplicate.rules.payTables[0].entries.push({ ...entry });
    expect(
      calculateMonthlyBaseRemuneration("2026-09", [profile()], resolver([duplicate])).positions[0]
        .issue?.code,
    ).toBe("TABLE_SELECTION_INVALID");
    // Metadata-free v3 still diagnoses the duplicate at the table lookup boundary.
    duplicate.engineContractVersion = 3;
    delete duplicate.rules.selection;
    expect(
      calculateMonthlyBaseRemuneration("2026-09", [profile()], resolver([duplicate])).positions[0]
        .issue?.code,
    ).toBe("TABLE_ENTRY_AMBIGUOUS");
    const gap = calculateMonthlyBaseRemuneration(
      "2026-09",
      [profile()],
      resolver([
        { ...candidate, validTo: "2026-09-10" },
        { ...candidate, versionId: "after-gap", validFrom: "2026-09-21" },
      ]),
    );
    expect(gap.positions.map((line) => [line.from, line.through, line.status])).toEqual([
      ["2026-09-01", "2026-09-10", "calculated"],
      ["2026-09-11", "2026-09-20", "unavailable"],
      ["2026-09-21", "2026-09-30", "calculated"],
    ]);
    expect(gap.totalCents).toBeNull();
  });
  it("rejects mismatched special parts and missing or duplicate weekly time rules", () => {
    const kOnly = {
      ...candidate,
      rules: {
        ...candidate.rules,
        selector: { ...candidate.rules.selector, specialPartIds: ["bt-k"] as [string] },
      },
    };
    expect(
      calculateMonthlyBaseRemuneration(
        "2026-09",
        [profile("2026-01-01", tariffData({ variant: "BT_B" }))],
        resolver([kOnly]),
      ).positions[0].issue?.code,
    ).toBe("TABLE_SELECTION_INVALID");
    const missing = structuredClone(candidate);
    missing.rules.weeklyWorkingTimeRules = [missing.rules.weeklyWorkingTimeRules![0]];
    expect(
      calculateMonthlyBaseRemuneration("2026-09", [profile()], resolver([missing])).positions[0]
        .issue?.code,
    ).toBe("WEEKLY_TIME_MISSING");
    const duplicate = structuredClone(candidate);
    duplicate.rules.weeklyWorkingTimeRules!.push(duplicate.rules.weeklyWorkingTimeRules![1]);
    expect(
      calculateMonthlyBaseRemuneration("2026-09", [profile()], resolver([duplicate])).positions[0]
        .issue?.code,
    ).toBe("WEEKLY_TIME_MISSING");
  });
  it("does not apply TVöD proration to an own-pay transition", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [
      profile("2026-01-01", own()),
      profile("2026-09-16", own(200000)),
    ]);
    expect(result.totalCents).toBeNull();
    expect(result.positions.map((position) => position.issue?.code)).toEqual([
      "OWN_PRORATION_UNCONFIRMED",
      "OWN_PRORATION_UNCONFIRMED",
    ]);
  });
  it("invalidates naturally for corrected profile content and a new resolver", () => {
    const original = profile();
    expect(calculateMonthlyBaseRemuneration("2026-09", [original], resolver()).totalCents).toBe(
      290718,
    );
    expect(
      calculateMonthlyBaseRemuneration(
        "2026-09",
        [{ ...original, data: tariffData({ group: "P6" }) }],
        resolver(),
      ).totalCents,
    ).toBe(301249);
    expect(
      calculateMonthlyBaseRemuneration(
        "2026-09",
        [original],
        resolver([changedTable(candidate, 333333)]),
      ).totalCents,
    ).toBe(333333);
  });
  it("rejects duplicate effective dates rather than choosing a random record", () => {
    expect(() => resolveRemunerationMonth("2026-09", [profile(), profile()], resolver())).toThrow(
      "Mehrdeutige",
    );
  });
  it.each(["2026-2", "2026-00", "2026-13", "1899-12", "2026-09-01"])(
    "rejects malformed month %s",
    (month) => {
      expect(() => calculateMonthlyBaseRemuneration(month, [])).toThrow();
    },
  );
  it("covers leap day and profile boundary inclusively", () => {
    const periods = resolveRemunerationMonth("2024-02", [
      profile("2024-02-01", own()),
      profile("2024-02-29", own(200000)),
    ]);
    expect(periods.map((item) => [item.from, item.through])).toEqual([
      ["2024-02-01", "2024-02-28"],
      ["2024-02-29", "2024-02-29"],
    ]);
  });
  it("rejects a resolver that returns another identity despite an explicit request", () => {
    const inconsistent: RuleResolver = {
      ...resolver(),
      resolveTariff: () => ({ ok: true, value: { ...candidate, packageId: "other" } }),
    };
    expect(resolveRemunerationContext("2026-09-01", [profile()], inconsistent)).toMatchObject({
      kind: "unavailable",
      issue: { code: "RULE_PACKAGE_NOT_FOUND" },
    });
  });
  it.each([
    [1, 2, 1],
    [1, 3, 0],
    [2, 3, 1],
    [301249, 2, 150625],
    [0, 2, 0],
  ])("rounds %s/%s cents HALF_UP", (numerator, denominator, expected) => {
    expect(roundRemunerationCents(numerator, denominator)).toBe(expected);
  });
  it.each([
    [1, 0],
    [-1, 2],
    [1.5, 2],
    [Number.MAX_SAFE_INTEGER + 1, 1],
  ])("rejects invalid monetary fractions %j/%j", (numerator, denominator) => {
    expect(() => roundRemunerationCents(numerator, denominator)).toThrow();
  });
});
