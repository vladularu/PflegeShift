import { describe, expect, it } from "vitest";

import holidayCandidateValue from "../../rules/packages/reviewed/de-holidays/2026.json";
import futureHolidayPackageValue from "../../rules/packages/reviewed/de-holidays/2027.json";
import { getPublicHolidays } from "@/engine/holidays";
import type { RuleHolidayPackage } from "@/rules/contracts.generated";
import { createRuleResolver, requireResolvedPackage } from "@/rules/rule-resolver";

function futurePackage(newYearName = "Neujahr"): RuleHolidayPackage {
  const candidate = structuredClone(futureHolidayPackageValue);
  candidate.rules.holidays.find((holiday) => holiday.id === "new-year")!.name = newYearName;
  return candidate as unknown as RuleHolidayPackage;
}

function holidayNames(
  year: number,
  federalState: "BY" | "NW",
  ruleResolver: ReturnType<typeof createRuleResolver>,
  holidayRegion: "NONE" | "BY_AUGSBURG" = "NONE",
): ReadonlyMap<string, string> {
  return new Map(
    getPublicHolidays(year, federalState, ruleResolver, holidayRegion).map((holiday) => [
      holiday.date,
      holiday.name,
    ]),
  );
}

describe("future holiday catalog resolution", () => {
  it("switches atomically from the immutable 2026 package to the open-ended 2027 package", () => {
    const resolver = createRuleResolver(
      {
        tariff: [],
        legal: [],
        holiday: [holidayCandidateValue as RuleHolidayPackage, futurePackage()],
      },
      { tariff: "unused", legal: "unused", holiday: "de-holidays" },
    );

    expect(requireResolvedPackage(resolver.resolveHoliday("2026-12-31")).versionId).toBe("2026");
    expect(requireResolvedPackage(resolver.resolveHoliday("2027-01-01")).versionId).toBe("2027");
    expect(requireResolvedPackage(resolver.resolveHoliday("2035-12-31")).versionId).toBe("2027");
  });

  it("calculates fixed, Easter-based and regional holidays in 2027 without a yearly package", () => {
    const resolver = createRuleResolver(
      {
        tariff: [],
        legal: [],
        holiday: [holidayCandidateValue as RuleHolidayPackage, futurePackage()],
      },
      { tariff: "unused", legal: "unused", holiday: "de-holidays" },
    );
    const northRhineWestphalia = holidayNames(2027, "NW", resolver);
    const augsburg = holidayNames(2027, "BY", resolver, "BY_AUGSBURG");

    expect(northRhineWestphalia.get("2027-01-01")).toBe("Neujahr");
    expect(northRhineWestphalia.get("2027-03-26")).toBe("Karfreitag");
    expect(northRhineWestphalia.get("2027-05-27")).toBe("Fronleichnam");
    expect(augsburg.get("2027-08-08")).toBe("Augsburger Friedensfest");
    expect(augsburg.get("2027-08-15")).toBe("Mariä Himmelfahrt");
  });

  it("keeps calculating the same recurring rules in 2035", () => {
    const resolver = createRuleResolver(
      {
        tariff: [],
        legal: [],
        holiday: [holidayCandidateValue as RuleHolidayPackage, futurePackage()],
      },
      { tariff: "unused", legal: "unused", holiday: "de-holidays" },
    );
    const northRhineWestphalia = holidayNames(2035, "NW", resolver);

    expect(northRhineWestphalia.get("2035-01-01")).toBe("Neujahr");
    expect(northRhineWestphalia.get("2035-03-23")).toBe("Karfreitag");
    expect(northRhineWestphalia.get("2035-05-24")).toBe("Fronleichnam");
    expect(northRhineWestphalia.get("2035-12-25")).toBe("1. Weihnachtstag");
  });

  it("isolates cached holiday values between resolver generations", () => {
    const generationTwo = createRuleResolver(
      { tariff: [], legal: [], holiday: [futurePackage("Neujahr Generation 2")] },
      { tariff: "unused", legal: "unused", holiday: "de-holidays" },
    );
    const independentGeneration = createRuleResolver(
      { tariff: [], legal: [], holiday: [futurePackage("Neujahr unabhängige Generation")] },
      { tariff: "unused", legal: "unused", holiday: "de-holidays" },
    );

    expect(holidayNames(2035, "NW", generationTwo).get("2035-01-01")).toBe("Neujahr Generation 2");
    expect(holidayNames(2035, "NW", independentGeneration).get("2035-01-01")).toBe(
      "Neujahr unabhängige Generation",
    );
    expect(holidayNames(2035, "NW", generationTwo).get("2035-01-01")).toBe("Neujahr Generation 2");
  });
});
