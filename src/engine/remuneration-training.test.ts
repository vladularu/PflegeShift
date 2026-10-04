import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2025-04.json";
import newValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { remunerationTariffOptions } from "@/features/settings/remuneration-tariff-options";
import {
  remunerationDataFromForm,
  remunerationFormValues,
} from "@/features/settings/remuneration-editor-values";
import { candidate, history, resolver, shift, work } from "./remuneration-test-fixtures";
import { resolveRemunerationContext } from "./remuneration-context";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";

const catalog = resolver([oldValue, newValue, candidate] as RuleTariffPackage[]);
function training(
  group = "b",
  level = "1",
  from = "2025-04-01",
  weeklyMinutes = 2310,
): DatedRemunerationProfile {
  return {
    ...history(from),
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tvaoed-pflege-vka",
        variant: "BT_K",
        region: "OTHER",
        group,
        level,
        fullTimeWeeklyMinutes: 2310,
      },
    },
  };
}

describe("TVAöD-Pflege dated pay", () => {
  // Independently transcribed from VKA § 8, not expectations derived from package rows.
  it.each([
    ["2025-04", "b", "1", 141569],
    ["2025-04", "b", "2", 147707],
    ["2025-04", "b", "3", 157838],
    ["2025-04", "c", "1", 129024],
    ["2025-04", "c", "2", 135030],
    ["2025-04", "c", "3", 144703],
    ["2026-05", "b", "1", 149069],
    ["2026-05", "b", "2", 155207],
    ["2026-05", "b", "3", 165338],
    ["2026-05", "c", "1", 136524],
    ["2026-05", "c", "2", 142530],
    ["2026-05", "c", "3", 152203],
  ])("%s category %s year %s = %s cents", (month, group, level, expected) => {
    const profile = training(String(group), String(level));
    const data = remunerationDataFromForm(
      remunerationFormValues(profile.data),
      month + "-01",
      catalog,
    );
    const result = calculateMonthlyBaseRemuneration(String(month), [{ ...profile, data }], catalog);
    expect(result).toMatchObject({ complete: true, totalCents: expected, status: "calculated" });
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].label).toContain("Ausbildungsentgelt");
    expect(result.positions[0].source.packageId).toBe("tvaoed-pflege-vka");
  });
  it("switches table versions on 1 May, not on the profile confirmation date", () => {
    const profiles = [training()];
    expect(calculateMonthlyBaseRemuneration("2026-04", profiles, catalog).totalCents).toBe(141569);
    expect(calculateMonthlyBaseRemuneration("2026-05", profiles, catalog).totalCents).toBe(149069);
    expect(calculateMonthlyBaseRemuneration("2027-04", profiles, catalog).totalCents).toBeNull();
    expect(
      resolveRemunerationContext("2025-03-31", [training("b", "1", "2025-01-01")], catalog).kind,
    ).toBe("unavailable");
  });
  it("uses 38.5 hours for BT-K trainees also in KAV BW, without inferring tariff from state", () => {
    const profile = training();
    if (profile.data.selection.kind !== "tariff") throw new Error("fixture");
    const bw = {
      ...profile,
      data: {
        ...profile.data,
        selection: { ...profile.data.selection, region: "KAV_BW", fullTimeWeeklyMinutes: 2340 },
      },
    };
    expect(resolveRemunerationContext("2026-09-01", [bw], catalog)).toMatchObject({
      kind: "training-tariff",
      fullTimeWeeklyMinutes: 2310,
    });
    expect(calculateMonthlyBaseRemuneration("2026-09", [bw], catalog).totalCents).toBe(149069);
  });
  it("shows proportional training pay as an explicit estimate, not a legal entitlement", () => {
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [training("b", "1", "2025-04-01", 1155)],
      catalog,
    );
    expect(result).toMatchObject({ status: "estimated", totalCents: 74535 });
    expect(result.positions[0].basis).toMatchObject({
      fullTimeMonthlyCents: 149069,
      personalMonthlyCents: 74535,
      weeklyMinutes: 1155,
      fullTimeWeeklyMinutes: 2310,
    });
  });
  it("applies an explicitly dated year change without rewriting the previous month", () => {
    const profiles = [training(), training("b", "2", "2026-09-15")];
    expect(calculateMonthlyBaseRemuneration("2026-08", profiles, catalog).totalCents).toBe(149069);
    const result = calculateMonthlyBaseRemuneration("2026-09", profiles, catalog);
    expect(result.positions.map((p) => [p.from, p.through, p.basis.calendarDays])).toEqual([
      ["2026-09-01", "2026-09-14", 14],
      ["2026-09-15", "2026-09-30", 16],
    ]);
    // 149069 × 14 / 30 = 69565.533...; 155207 × 16 / 30 = 82777.066...
    // Per-position cent rounding: 69566 + 82777.
    expect(result.totalCents).toBe(152343);
    expect(result.status).toBe("estimated");
  });
  it.each([
    ["P5", "1"],
    ["b", "0"],
    ["b", "4"],
    ["b", "01"],
    ["d", "1"],
  ])("rejects category %s year %s instead of selecting a neighbouring value", (group, year) => {
    expect(resolveRemunerationContext("2026-09-01", [training(group, year)], catalog).kind).toBe(
      "unavailable",
    );
  });
  it("does not turn unsupported components into zero or base pay into total gross", () => {
    for (const shifts of [[], [shift({ overtimeMinutes: 30, tariffOvertimeConfirmed: true })]]) {
      const result = calculateDatedMonthlyRemuneration({
        month: "2026-09",
        shifts,
        workProfile: work,
        history: [training()],
        allowanceEntitlements: [],
        resolver: catalog,
      });
      expect(result.base.totalCents).toBe(149069);
      expect(result.complete).toBe(false);
      expect(result.estimatedGrossCents).toBeNull();
      expect(result.allowances.totalCents).toBeNull();
      if (shifts.length) {
        expect(result.timePremiums.totalCents).toBe(356);
        expect(result.overtime).toMatchObject({ totalCents: 580, status: "estimated" });
      }
    }
  });
  it("offers real category labels and only declared training years beside unchanged P groups", () => {
    const available = remunerationTariffOptions("2026-09-01", catalog).available;
    const apprentice = available.find((option) => option.id === "tvaoed-pflege-vka")!;
    expect(apprentice.employmentKind).toBe("APPRENTICE");
    expect(apprentice.groups.map((g) => [g.id, g.levels])).toEqual([
      ["b", ["1", "2", "3"]],
      ["c", ["1", "2", "3"]],
    ]);
    expect(apprentice.groups[0].label).toContain("Kategorie b");
    const employee = available.find((option) => option.id === candidate.packageId)!;
    expect(employee.groups.find((g) => g.id === "P5")?.levels).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(employee.groups.find((g) => g.id === "P7")?.levels).not.toContain("1");
  });
});
