import { describe, expect, it } from "vitest";
import { history, resolver } from "@/engine/remuneration-test-fixtures";
import type { MonthlyAllowanceDecisions } from "@/domain/allowance-decisions";
import trainingValue from "../../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  allowanceConfirmationPeriods,
  prepareAllowanceConfirmation,
} from "./allowance-confirmation-model";

const current: MonthlyAllowanceDecisions = {
  month: "2026-09",
  revision: 3,
  updatedAt: "2026-09-01T00:00:00Z",
  decisions: [
    {
      from: "2026-09-01",
      through: "2026-09-30",
      tariff: { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" },
      allowanceStatus: "SHIFT_MONTHLY",
      revision: 3,
      confirmedAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    },
  ],
};
const input = () => ({
  month: "2026-09",
  from: "2026-09-10",
  through: "2026-09-20",
  status: "NONE" as const,
  history: [history()],
  current,
  resolver: resolver(),
});

describe("dated allowance confirmation model", () => {
  it("allows training shift allowance confirmation with its actual tariff identity", () => {
    const profile = history();
    if (profile.data.selection.kind !== "tariff") throw new Error("fixture");
    const profiles = [
      {
        ...profile,
        data: {
          ...profile.data,
          selection: {
            ...profile.data.selection,
            packageId: "tvaoed-pflege-vka",
            group: "b",
            level: "1",
          },
        },
      },
    ];
    const periods = allowanceConfirmationPeriods(
      "2026-09",
      profiles,
      resolver([trainingValue as RuleTariffPackage]),
    );
    expect(periods).toHaveLength(1);
    expect(periods[0].available).toBe(true);
    expect(periods[0].label).toContain("TVAöD-Pflege");
    expect(periods[0].label).not.toContain("Eigene Vergütung");
    const saved = prepareAllowanceConfirmation({
      ...input(),
      history: profiles,
      current: { ...current, decisions: [] },
      status: "ALTERNATING_MONTHLY",
      resolver: resolver([trainingValue as RuleTariffPackage]),
    });
    expect(saved.decisions[0]).toMatchObject({
      tariff: { packageId: "tvaoed-pflege-vka", variant: "BT_K", region: "OTHER" },
      allowanceStatus: "ALTERNATING_MONTHLY",
    });
  });
  it("replaces only the chosen days without modifying its source or applying a default status", () => {
    const result = prepareAllowanceConfirmation(input());
    expect(result.expectedRevision).toBe(3);
    expect(
      result.decisions.map(({ from, through, allowanceStatus }) => [
        from,
        through,
        allowanceStatus,
      ]),
    ).toEqual([
      ["2026-09-01", "2026-09-09", "SHIFT_MONTHLY"],
      ["2026-09-10", "2026-09-20", "NONE"],
      ["2026-09-21", "2026-09-30", "SHIFT_MONTHLY"],
    ]);
    expect(current.decisions).toHaveLength(1);
    expect(() => prepareAllowanceConfirmation({ ...input(), status: "UNSET" })).toThrow(
      "auswählen",
    );
  });
  it.each([
    { from: "2026-08-31" },
    { through: "2026-10-01" },
    { from: "2026-09-31" },
    { from: "2026-09-21" },
    { month: "2026-9" },
  ])("rejects invalid intervals %j", (change) => {
    expect(() => prepareAllowanceConfirmation({ ...input(), ...change })).toThrow();
  });
  it("does not invent a tariff from an undated, missing, or own-pay profile", () => {
    for (const profiles of [
      [],
      [{ ...history(), effectiveFrom: null }],
      [
        {
          ...history(),
          data: {
            ...history().data,
            selection: { kind: "own-monthly" as const, monthlyGrossCents: 300000 },
          },
        },
      ],
    ])
      expect(() => prepareAllowanceConfirmation({ ...input(), history: profiles })).toThrow(
        "datierter Tarif",
      );
  });
  it("allows a group change within the same tariff but rejects region changes", () => {
    const change = history("2026-09-15", "P6");
    expect(
      prepareAllowanceConfirmation({ ...input(), history: [history(), change] }).decisions,
    ).toHaveLength(3);
    const selection = change.data.selection;
    if (selection.kind !== "tariff") throw new Error("test fixture");
    expect(() =>
      prepareAllowanceConfirmation({
        ...input(),
        history: [
          history(),
          { ...change, data: { ...change.data, selection: { ...selection, region: "KAV_BW" } } },
        ],
      }),
    ).toThrow("Tarifwechsel");
  });
  it("keeps disjoint confirmations and replaces a full month without overlaps", () => {
    const result = prepareAllowanceConfirmation({
      ...input(),
      from: "2026-09-01",
      through: "2026-09-30",
    });
    expect(result.decisions).toHaveLength(1);
    const disjoint = {
      ...current,
      decisions: [{ ...current.decisions[0], through: "2026-09-05" }],
    };
    expect(prepareAllowanceConfirmation({ ...input(), current: disjoint }).decisions).toHaveLength(
      2,
    );
  });
  it("shows unavailable periods rather than allowing expired or missing rule packages", () => {
    const periods = allowanceConfirmationPeriods("2027-04", [history()], resolver());
    expect(periods.every((period) => !period.available)).toBe(true);
    expect(() =>
      prepareAllowanceConfirmation({
        ...input(),
        month: "2027-04",
        from: "2027-04-01",
        through: "2027-04-30",
        current: { ...current, month: "2027-04" },
      }),
    ).toThrow("datierter Tarif");
  });
  it("labels each dated group and tariff region without borrowing the old month profile", () => {
    const periods = allowanceConfirmationPeriods(
      "2026-09",
      [history(), history("2026-09-15", "P6")],
      resolver(),
    );
    expect(periods.map((period) => [period.from, period.through, period.available])).toEqual([
      ["2026-09-01", "2026-09-14", true],
      ["2026-09-15", "2026-09-30", true],
    ]);
    expect(periods[0].label).toContain("P5/1");
    expect(periods[1].label).toContain("P6/1");
  });
});
