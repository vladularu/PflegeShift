import { describe, expect, it } from "vitest";
import { FEDERAL_STATES } from "@/domain/types";
import {
  applicableAllowanceRules,
  calculateMonthlyAllowanceAmounts,
} from "@/engine/pay-allowances";
import { calculateMonthlyDatedAllowances } from "@/engine/remuneration-allowances";
import {
  history,
  resolver as createResolver,
  shift,
  work,
} from "@/engine/remuneration-test-fixtures";
import legacyValue from "./__fixtures__/original-tvoed-selection-r2.json";
import type { RuleTariffPackage } from "./contracts.generated";
import currentValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import {
  remunerationDataFromForm,
  remunerationFormValues,
} from "@/features/settings/remuneration-editor-values";
import { remunerationTariffOptions } from "@/features/settings/remuneration-tariff-options";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { validateRulePackage } from "./validation";
const candidate = currentValue as RuleTariffPackage;
const resolver = (packages = [candidate]) => createResolver(packages);

describe("TVöD-P selection candidate", () => {
  it("uses the current reviewed contract with explicit annual-payment support", () => {
    expect(validateRulePackage(candidate).ok).toBe(true);
    expect(candidate.engineContractVersion).toBe(11);
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).toContain(11);
    expect(candidate.status).toBe("REVIEWED");
    expect(candidate.review).toMatchObject({
      status: "REVIEWED",
      reviewedBy: expect.any(String),
      reviewedAt: expect.any(String),
      gitCommit: expect.stringMatching(/^[0-9a-f]{40}$/u),
    });
    expect(candidate.rules.selection).toMatchObject({
      familyId: "tvoed-p",
      engineId: "tvoed-p-v3",
      employmentKind: "EMPLOYEE",
      capabilities: { annualPayment: "SUPPORTED" },
    });
    expect(candidate.sources.slice(0, 2).map((source) => source.documentDate)).toEqual([
      "2025-04-06",
      "2025-04-06",
    ]);
  });

  it("keeps the original r2 draft unreviewed and rejects its retired contract", () => {
    expect(legacyValue.engineContractVersion).toBe(8);
    expect(legacyValue.status).toBe("DRAFT");
    expect(legacyValue.review).toEqual({
      status: "DRAFT",
      reviewedBy: null,
      reviewedAt: null,
      gitCommit: null,
    });
    expect(legacyValue.rules.selection.capabilities.annualPayment).toBe("UNSUPPORTED");
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(8);
    expect(validateRulePackage(legacyValue).ok).toBe(false);
  });

  it.each(FEDERAL_STATES)(
    "uses tariff membership, not federal state %s, for each hourly allowance",
    (federalState) => {
      for (const date of ["2026-05-01", "2026-09-22", "2027-03-31"]) {
        for (const sector of ["BT_K", "BT_B"] as const) {
          for (const tariffRegion of ["OTHER", "KAV_BW"] as const) {
            const fullTimeWeeklyMinutes =
              sector === "BT_K" && tariffRegion === "OTHER" ? 2310 : 2340;
            const profile = {
              ...work,
              federalState,
              weeklyMinutes: fullTimeWeeklyMinutes / 2,
              tariff: { ...work.tariff!, sector, tariffRegion, fullTimeWeeklyMinutes },
            };
            for (const status of ["SHIFT_HOURLY", "ALTERNATING_HOURLY"] as const) {
              const input = {
                date,
                rulePackage: candidate,
                profile,
                fullTimeWeeklyMinutes,
                status,
                workMinutes: 150,
              };
              const type = status === "SHIFT_HOURLY" ? "shift" : "alternating-shift";
              expect(applicableAllowanceRules(type, input)).toHaveLength(1);
              const result = calculateMonthlyAllowanceAmounts(input);
              const rateCents =
                status === "SHIFT_HOURLY"
                  ? sector === "BT_K" && tariffRegion === "OTHER"
                    ? 60
                    : 59
                  : sector === "BT_K" && tariffRegion === "OTHER"
                    ? 149
                    : 147;
              // 2.5 actual hours, rounded once; no additional half-time reduction.
              expect(result.allowanceAmount).toBe(Math.round(rateCents * 2.5) / 100);
              expect(result.careAllowanceAmount).toBe(70.91);
              expect(result.tvoedAllowanceAmount).toBe(tariffRegion === "KAV_BW" ? 17.5 : 12.5);
            }
          }
        }
      }
    },
  );

  it.each(["BT_K", "BT_B"] as const)(
    "round-trips real %s metadata through form validation and dated calculation",
    (sector) => {
      const catalog = resolver();
      const options = remunerationTariffOptions("2026-09-01", catalog);
      expect(options.unavailable).toEqual([]);
      const tariff = options.available.find((option) => option.id === candidate.packageId)!;
      expect(
        tariff.variants
          .find((variant) => variant.id === sector)!
          .regions.map((region) => region.id)
          .sort(),
      ).toEqual(["KAV_BW", "OTHER"]);
      for (const tariffRegion of ["KAV_BW", "OTHER"] as const) {
        const fullTimeWeeklyMinutes = sector === "BT_K" && tariffRegion === "OTHER" ? 2310 : 2340;
        const values = {
          ...remunerationFormValues(history().data),
          sector,
          tariffRegion,
          weeklyHours: String(fullTimeWeeklyMinutes / 120),
        };
        const data = remunerationDataFromForm(values, "2026-09-01", catalog);
        expect(data.selection).toMatchObject({
          variant: sector,
          region: tariffRegion,
          fullTimeWeeklyMinutes,
        });
        for (const federalState of ["BW", "HE"] as const) {
          const result = calculateMonthlyDatedAllowances(
            "2026-09",
            [shift({ date: "2026-09-15", startTime: "08:00", endTime: "10:30" })],
            { ...work, federalState },
            [{ ...history("2026-09-01"), data }],
            [
              {
                from: "2026-09-01",
                through: "2026-09-30",
                status: "SHIFT_HOURLY",
                origin: "confirmed",
                revision: 1,
              },
            ],
            catalog,
          );
          expect(result.status).toBe("calculated");
          expect(
            result.positions.find((position) => position.basis.allowanceType === "shift")
              ?.amountCents,
          ).toBe(sector === "BT_K" && tariffRegion === "OTHER" ? 150 : 148);
        }
        expect(() =>
          remunerationDataFromForm({ ...values, tariffRegion: "UNKNOWN" }, "2026-09-01", catalog),
        ).toThrow();
        for (const date of ["2026-04-30", "2027-04-01"]) {
          expect(remunerationTariffOptions(date, catalog).available).toEqual([]);
          expect(() => remunerationDataFromForm(values, date, catalog)).toThrow();
        }
      }
    },
  );
});
