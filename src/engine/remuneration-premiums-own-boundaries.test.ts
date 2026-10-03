import { describe, expect, it } from "vitest";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import type { OwnRemunerationConfiguration } from "@/domain/own-remuneration";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";
import {
  calculateDatedShiftTimePremiums,
  calculateMonthlyTimeRemuneration,
} from "./remuneration-premiums";

function own(
  configuration: OwnRemunerationConfiguration,
  from = "2026-01-01",
): DatedRemunerationProfile {
  return {
    ...history(from),
    data: { version: 2, weeklyMinutes: 1155, selection: { kind: "own-configured", configuration } },
  };
}

describe("dated own time premium integration", () => {
  it("does not add another rounding step at midnight", () => {
    const configuration: OwnRemunerationConfiguration = {
      ...ownRemunerationFixture(),
      percentageBasisHourlyCents: 1,
      timePremiums: {
        combination: "highest",
        rules: [
          {
            id: "night",
            type: "night",
            window: { startMinute: 1320, endMinute: 360 },
            rate: { kind: "percent", basisPoints: 5000 },
          },
        ],
      },
    };
    const result = calculateDatedShiftTimePremiums(
      shift({ startTime: "23:15", endTime: "00:45" }),
      work,
      [own(configuration)],
      resolver(),
    );
    expect(result.positions).toHaveLength(1);
    expect(result.netMinutes).toBe(90);
    expect(result.totalCents).toBe(1);
    expect(result.positions[0].through).toBe("2026-09-16");
  });
  it("keeps separately confirmed midnight rates as separate positions", () => {
    const before = ownRemunerationFixture();
    const after = { ...ownRemunerationFixture(), percentageBasisHourlyCents: 3000 };
    const result = calculateDatedShiftTimePremiums(
      shift(),
      work,
      [own(before), own(after, "2026-09-16")],
      resolver(),
    );
    expect(result.positions.map((p) => [p.from, p.amountCents])).toEqual([
      ["2026-09-15", 625],
      ["2026-09-16", 750],
    ]);
    expect(result.totalCents).toBe(1375);
  });
  it("assigns carryover to each actual month without duplicate minutes", () => {
    const configuration = ownRemunerationFixture();
    const entry = shift({ date: "2026-09-30" });
    const september = calculateMonthlyTimeRemuneration(
      "2026-09",
      [entry],
      work,
      [own(configuration)],
      resolver(),
    );
    const october = calculateMonthlyTimeRemuneration(
      "2026-10",
      [entry],
      work,
      [own(configuration)],
      resolver(),
    );
    expect([september.netMinutes, october.netMinutes]).toEqual([60, 60]);
    expect([september.totalCents, october.totalCents]).toEqual([625, 625]);
  });
});
