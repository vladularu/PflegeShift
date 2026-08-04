import { describe, expect, it } from "vitest";

import { easterSunday, getPublicHolidays } from "@/engine/holidays";

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
});
