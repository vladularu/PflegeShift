import { describe, expect, it } from "vitest";

import type { ShiftType } from "@/domain/types";
import { buildAnnualDistributionSections } from "@/features/analysis/annual-distribution";

describe("buildAnnualDistributionSections", () => {
  it("calculates percentages from services only and separates absences", () => {
    const distribution = new Map<ShiftType, number>([
      ["EARLY", 30],
      ["NIGHT", 23],
      ["TRAINING", 2],
      ["FREE", 21],
      ["VACATION", 9],
      ["SICK", 0],
    ]);

    const sections = buildAnnualDistributionSections(distribution);

    expect(sections.services).toEqual([
      { type: "EARLY", count: 30, percentage: 55 },
      { type: "NIGHT", count: 23, percentage: 42 },
      { type: "TRAINING", count: 2, percentage: 4 },
    ]);
    expect(sections.absences).toEqual([
      { type: "FREE", count: 21 },
      { type: "VACATION", count: 9 },
    ]);
  });

  it("returns empty sections when the year has no entries", () => {
    expect(buildAnnualDistributionSections(new Map())).toEqual({
      services: [],
      absences: [],
    });
  });
});
