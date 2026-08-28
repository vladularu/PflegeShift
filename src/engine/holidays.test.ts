import { describe, expect, it } from "vitest";

import holidayCandidateValue from "../../rules/packages/reviewed/de-holidays/2026.json";
import { easterSunday, getPublicHolidays } from "@/engine/holidays";
import { BUNDLED_HOLIDAY_RULES } from "@/rules/bundled-rules";
import type { RuleHolidayPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";

describe("German public holidays", () => {
  it("calculates Gregorian Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  it("applies federal-state rules", () => {
    const northRhineWestphalia = getPublicHolidays(2026, "NW");
    expect(northRhineWestphalia).toContainEqual({
      date: "2026-06-04",
      name: "Fronleichnam",
      scope: "STATEWIDE",
    });
    expect(northRhineWestphalia.some((holiday) => holiday.name === "Reformationstag")).toBe(false);

    const saxony = getPublicHolidays(2026, "SN");
    expect(saxony.some((holiday) => holiday.name === "Reformationstag")).toBe(true);
    expect(saxony.some((holiday) => holiday.name === "Buß- und Bettag")).toBe(true);
    expect(
      getPublicHolidays(2017, "NI").some((holiday) => holiday.name === "Reformationstag"),
    ).toBe(true);
    expect(
      getPublicHolidays(2016, "NI").some((holiday) => holiday.name === "Reformationstag"),
    ).toBe(false);
  });

  it("covers every federal state with the nationwide baseline", () => {
    const states = [
      "BW",
      "BY",
      "BE",
      "BB",
      "HB",
      "HH",
      "HE",
      "MV",
      "NI",
      "NW",
      "RP",
      "SL",
      "SN",
      "ST",
      "SH",
      "TH",
    ] as const;
    for (const state of states) {
      expect(
        getPublicHolidays(2026, state).filter((holiday) => holiday.scope === "NATIONWIDE"),
      ).toHaveLength(9);
    }
  });

  it("resolves every package boundary inside a calendar year", () => {
    const firstHalf = structuredClone(BUNDLED_HOLIDAY_RULES[0]);
    firstHalf.versionId = "first-half";
    firstHalf.validTo = "2026-06-30";
    const secondHalf = structuredClone(BUNDLED_HOLIDAY_RULES[0]);
    secondHalf.versionId = "second-half";
    secondHalf.validFrom = "2026-07-01";
    secondHalf.rules.holidays.find((holiday) => holiday.id === "german-unity-day")!.name =
      "Tag der Deutschen Einheit aus Folgepaket";
    const resolver = createRuleResolver({
      tariff: [],
      legal: [],
      holiday: [firstHalf, secondHalf],
    });

    expect(getPublicHolidays(2026, "NW", resolver)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-01-01", name: "Neujahr" }),
        expect.objectContaining({
          date: "2026-10-03",
          name: "Tag der Deutschen Einheit aus Folgepaket",
        }),
      ]),
    );
  });

  it("isolates regional holidays by the confirmed workplace region", () => {
    const resolver = createRuleResolver(
      { tariff: [], legal: [], holiday: [holidayCandidateValue as RuleHolidayPackage] },
      { tariff: "unused", legal: "unused", holiday: "de-holidays" },
    );
    const names = (state: "BY" | "SN" | "TH", region: Parameters<typeof getPublicHolidays>[3]) =>
      getPublicHolidays(2026, state, resolver, region).map((holiday) => holiday.name);

    expect(names("BY", "NONE")).not.toContain("Mariä Himmelfahrt");
    expect(names("BY", "BY_MARIA_HIMMELFAHRT")).toContain("Mariä Himmelfahrt");
    expect(names("BY", "BY_AUGSBURG")).toEqual(
      expect.arrayContaining(["Augsburger Friedensfest", "Mariä Himmelfahrt"]),
    );
    expect(names("SN", "SN_FRONLEICHNAM")).toContain("Fronleichnam");
    expect(names("TH", "TH_FRONLEICHNAM")).toContain("Fronleichnam");
    expect(names("SN", "NONE")).not.toContain("Fronleichnam");
    expect(names("TH", "NONE")).not.toContain("Fronleichnam");
  });
});
