import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftMonth,
  type CaritasCareDraftMonthResult,
} from "./caritas-care-draft-month";

function candidate(region: string, version: string): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../rules/packages/reviewed/avr-caritas-p-" + region + "/" + version + "-draft1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function checkKnownSubtotal(
  result: CaritasCareDraftMonthResult,
  expected: {
    readonly packageId: string;
    readonly month: string;
    readonly baseCents: number;
    readonly fixedCents: number;
    readonly careCents: number;
    readonly subtotalCents: number;
  },
): void {
  expect(result).toMatchObject({
    kind: "draft-known-subtotal",
    status: "estimated",
    packageId: expected.packageId,
    month: expected.month,
    knownSubtotalCents: expected.subtotalCents,
    excludedComponents: ["OVERTIME", "ANNUAL_PAYMENT", "OTHER_LOCAL_TERMS"],
  });
  if (result.kind !== "draft-known-subtotal") throw new Error(result.reason);
  expect(result.positions.map(({ component, amountCents }) => [component, amountCents])).toEqual([
    ["base", expected.baseCents],
    ["fixed-allowance", expected.fixedCents],
    ["care-allowance", expected.careCents],
    ["shift-allowance", 0],
    ["time-premiums", 0],
  ]);
  expect(result.positions.slice(0, 3).every(({ sourceIds }) => sourceIds.length > 0)).toBe(true);
}

const westRegions = [
  {
    region: "bw",
    territory: "BW",
    fullTime31: 2340,
    fixedCents: 3500,
    subtotals2025: [310340, 327355, 344482, 380910, 390196, 407706],
    subtotals2026: [318931, 336423, 354029, 391477, 401023, 419023],
  },
  {
    region: "bayern",
    territory: "BAYERN",
    fullTime31: 2310,
    fixedCents: 2500,
    subtotals2025: [309340, 326355, 343482, 379910, 389196, 406706],
    subtotals2026: [317931, 335423, 353029, 390477, 400023, 418023],
  },
  {
    region: "mitte",
    territory: "MITTE",
    fullTime31: 2340,
    fixedCents: 2500,
    subtotals2025: [309340, 326355, 343482, 379910, 389196, 406706],
    subtotals2026: [317931, 335423, 353029, 390477, 400023, 418023],
  },
  {
    region: "nord",
    territory: "NORD",
    fullTime31: 2310,
    fixedCents: 2500,
    subtotals2025: [309340, 326355, 343482, 379910, 389196, 406706],
    subtotals2026: [317931, 335423, 353029, 390477, 400023, 418023],
  },
  {
    region: "nrw",
    territory: "NRW",
    fullTime31: 2310,
    fixedCents: 2500,
    subtotals2025: [309340, 326355, 343482, 379910, 389196, 406706],
    subtotals2026: [317931, 335423, 353029, 390477, 400023, 418023],
  },
] as const;

// BK 05.06.2025 (corrected), Anlagen 31/32 Anhang B; see docs/vg06a-caritas-regionale-quellen.md.
const periods = [
  {
    month: "2025-09",
    version: "2025-07-01",
    baseCents: [293044, 310059, 327186, 363614, 372900, 390410],
    careCents: 13796,
  },
  {
    month: "2026-09",
    version: "2026-02-01",
    baseCents: [301249, 318741, 336347, 373795, 383341, 401341],
    careCents: 14182,
  },
] as const;

describe("Caritas sourced P6/1-6 full-month DRAFT references, not complete gross pay", () => {
  for (const row of westRegions) {
    for (const period of periods) {
      for (const variantId of ["ANLAGE_31", "ANLAGE_32"] as const) {
        for (const stepId of ["1", "2", "3", "4", "5", "6"] as const) {
          it(row.region + " " + variantId + " P6/" + stepId + " " + period.month, () => {
            const pkg = candidate(row.region, period.version);
            const weeklyMinutes = variantId === "ANLAGE_32" ? 2340 : row.fullTime31;
            const result = calculateCaritasCareDraftMonth({
              pkg,
              month: period.month,
              variantId,
              regionId: row.territory,
              groupId: "p6",
              stepId,
              weeklyMinutes,
              fullMonthEmploymentConfirmed: true,
              fullMonthlyBaseEntitlementConfirmed: true,
              fixedAllowanceClaim: "ENTITLED",
              careAllowanceClaim: "ENTITLED",
              shiftEntitlements: [
                {
                  from: period.month + "-01",
                  through: period.month + "-30",
                  status: "NONE",
                  origin: "confirmed",
                  revision: 1,
                },
              ],
              workedSlices: [],
              workDataComplete: true,
              localAgreement: "NONE_CONFIRMED",
            });
            checkKnownSubtotal(result, {
              packageId: "avr-caritas-p-" + row.region,
              month: period.month,
              baseCents: period.baseCents[Number(stepId) - 1],
              fixedCents: row.fixedCents,
              careCents: period.careCents,
              subtotalCents:
                period.month === "2025-09"
                  ? row.subtotals2025[Number(stepId) - 1]
                  : row.subtotals2026[Number(stepId) - 1],
            });
          });
        }
      }
    }
  }

  // RK Ost 2025/2026, Anlagen 31/32 Anhang B; see docs/vg06d-caritas-ost-kandidaten.md.
  for (const territory of [
    "OST_TARIF_OST",
    "OST_TARIF_WEST_BERLIN",
    "OST_TARIF_WEST_HAMBURG",
  ] as const) {
    for (const variantId of ["ANLAGE_31", "ANLAGE_32"] as const) {
      for (const month of ["2025-09", "2026-09"] as const) {
        for (const stepId of ["1", "2", "3", "4", "5", "6"] as const) {
          it("ost " + territory + " " + variantId + " P6/" + stepId + " " + month, () => {
            const is2025 = month === "2025-09";
            const east2025 = is2025 && variantId === "ANLAGE_32" && territory === "OST_TARIF_OST";
            const result = calculateCaritasCareDraftMonth({
              pkg: candidate("ost", is2025 ? "2025-01" : "2026-01"),
              month,
              variantId,
              regionId: territory,
              groupId: "p6",
              stepId,
              weeklyMinutes: variantId === "ANLAGE_31" ? 2310 : 2340,
              fullMonthEmploymentConfirmed: true,
              fullMonthlyBaseEntitlementConfirmed: true,
              fixedAllowanceClaim: "ENTITLED",
              careAllowanceClaim: "ENTITLED",
              shiftEntitlements: [
                {
                  from: month + "-01",
                  through: month + "-30",
                  status: "NONE",
                  origin: "confirmed",
                  revision: 1,
                },
              ],
              workedSlices: [],
              workDataComplete: true,
              localAgreement: "NONE_CONFIRMED",
            });
            checkKnownSubtotal(result, {
              packageId: "avr-caritas-p-ost",
              month,
              baseCents: is2025
                ? east2025
                  ? [287685, 305040, 322510, 359666, 369138, 386620][Number(stepId) - 1]
                  : [289095, 306535, 324091, 361429, 370948, 388515][Number(stepId) - 1]
                : [300370, 317810, 335366, 372704, 382223, 400170][Number(stepId) - 1],
              fixedCents: 2500,
              careCents: is2025 ? 13796 : 14182,
              subtotalCents: is2025
                ? east2025
                  ? [303981, 321336, 338806, 375962, 385434, 402916][Number(stepId) - 1]
                  : [305391, 322831, 340387, 377725, 387244, 404811][Number(stepId) - 1]
                : [317052, 334492, 352048, 389386, 398905, 416852][Number(stepId) - 1],
            });
          });
        }
      }
    }
  }
});

// P4 has all six steps in the same official tables; the two allowances apply to P4-P16.
const p4WestPeriods = [
  {
    month: "2025-09",
    version: "2025-07-01",
    baseCents: [286114, 292132, 296594, 299961, 302701, 306810],
    careCents: 13796,
  },
  {
    month: "2026-09",
    version: "2026-02-01",
    baseCents: [294125, 300312, 304899, 308360, 311177, 315401],
    careCents: 14182,
  },
] as const;

const p4OstPeriods = [
  {
    month: "2025-09",
    version: "2025-01",
    commonBaseCents: [281992, 288160, 292734, 296185, 298994, 303205],
    specialBaseCents: [280616, 286755, 291306, 294740, 297535, 301726],
    careCents: 13796,
  },
  {
    month: "2026-09",
    version: "2026-01",
    commonBaseCents: [293267, 299435, 304009, 307460, 310269, 314480],
    specialBaseCents: null,
    careCents: 14182,
  },
] as const;

function checkAdditionalReference(input: {
  readonly region: string;
  readonly groupId: "p4" | "p6";
  readonly version: string;
  readonly month: string;
  readonly variantId: string;
  readonly territory: string;
  readonly stepId: string;
  readonly weeklyMinutes: number;
  readonly baseCents: number;
  readonly fixedCents: number;
  readonly careCents: number;
}): void {
  const result = calculateCaritasCareDraftMonth({
    pkg: candidate(input.region, input.version),
    month: input.month,
    variantId: input.variantId,
    regionId: input.territory,
    groupId: input.groupId,
    stepId: input.stepId,
    weeklyMinutes: input.weeklyMinutes,
    fullMonthEmploymentConfirmed: true,
    fullMonthlyBaseEntitlementConfirmed: true,
    fixedAllowanceClaim: "ENTITLED",
    careAllowanceClaim: "ENTITLED",
    shiftEntitlements: [
      {
        from: input.month + "-01",
        through: input.month + "-30",
        status: "NONE",
        origin: "confirmed",
        revision: 1,
      },
    ],
    workedSlices: [],
    workDataComplete: true,
    localAgreement: "NONE_CONFIRMED",
  });
  checkKnownSubtotal(result, {
    packageId: "avr-caritas-p-" + input.region,
    month: input.month,
    baseCents: input.baseCents,
    fixedCents: input.fixedCents,
    careCents: input.careCents,
    subtotalCents: input.baseCents + input.fixedCents + input.careCents,
  });
}

describe("Caritas sourced P4/1-6 full-month DRAFT references, not complete gross pay", () => {
  for (const row of westRegions) {
    for (const period of p4WestPeriods) {
      for (const variantId of ["ANLAGE_31", "ANLAGE_32"] as const) {
        for (const [index, baseCents] of period.baseCents.entries()) {
          it(row.region + " " + variantId + " P4/" + (index + 1) + " " + period.month, () => {
            checkAdditionalReference({
              region: row.region,
              groupId: "p4",
              version: period.version,
              month: period.month,
              variantId,
              territory: row.territory,
              stepId: String(index + 1),
              weeklyMinutes: variantId === "ANLAGE_32" ? 2340 : row.fullTime31,
              baseCents,
              fixedCents: row.fixedCents,
              careCents: period.careCents,
            });
          });
        }
      }
    }
  }

  for (const territory of [
    "OST_TARIF_OST",
    "OST_TARIF_WEST_BERLIN",
    "OST_TARIF_WEST_HAMBURG",
  ] as const) {
    for (const period of p4OstPeriods) {
      for (const variantId of ["ANLAGE_31", "ANLAGE_32"] as const) {
        const special2025 = variantId === "ANLAGE_32" && territory === "OST_TARIF_OST";
        const baseCentsByStep = special2025
          ? (period.specialBaseCents ?? period.commonBaseCents)
          : period.commonBaseCents;
        for (const [index, baseCents] of baseCentsByStep.entries()) {
          it(
            "ost " + territory + " " + variantId + " P4/" + (index + 1) + " " + period.month,
            () => {
              checkAdditionalReference({
                region: "ost",
                groupId: "p4",
                version: period.version,
                month: period.month,
                variantId,
                territory,
                stepId: String(index + 1),
                weeklyMinutes: variantId === "ANLAGE_31" ? 2310 : 2340,
                baseCents,
                fixedCents: 2500,
                careCents: period.careCents,
              });
            },
          );
        }
      }
    }
  }
});

// Half of the dated regional full-time hours; expected cents are rounded independently.
const halfTimeWestPeriods = [
  {
    month: "2025-09",
    version: "2025-07-01",
    baseCents: { p4: 143057, p6: 146522 },
    careCents: 6898,
  },
  {
    month: "2026-09",
    version: "2026-02-01",
    baseCents: { p4: 147063, p6: 150625 },
    careCents: 7091,
  },
] as const;

const halfTimeOstPeriods = [
  {
    month: "2025-09",
    version: "2025-01",
    commonBaseCents: { p4: 140996, p6: 144548 },
    specialBaseCents: { p4: 140308, p6: 143843 },
    careCents: 6898,
  },
  {
    month: "2026-09",
    version: "2026-01",
    commonBaseCents: { p4: 146634, p6: 150185 },
    specialBaseCents: null,
    careCents: 7091,
  },
] as const;

describe("Caritas sourced P4/P6 half-time DRAFT references, not complete gross pay", () => {
  for (const row of westRegions) {
    for (const period of halfTimeWestPeriods) {
      for (const variantId of ["ANLAGE_31", "ANLAGE_32"] as const) {
        for (const groupId of ["p4", "p6"] as const) {
          it(row.region + " " + variantId + " " + groupId + "/1 half-time " + period.month, () => {
            checkAdditionalReference({
              region: row.region,
              groupId,
              version: period.version,
              month: period.month,
              variantId,
              territory: row.territory,
              stepId: "1",
              weeklyMinutes: (variantId === "ANLAGE_32" ? 2340 : row.fullTime31) / 2,
              baseCents: period.baseCents[groupId],
              fixedCents: row.fixedCents / 2,
              careCents: period.careCents,
            });
          });
        }
      }
    }
  }

  for (const territory of [
    "OST_TARIF_OST",
    "OST_TARIF_WEST_BERLIN",
    "OST_TARIF_WEST_HAMBURG",
  ] as const) {
    for (const period of halfTimeOstPeriods) {
      for (const variantId of ["ANLAGE_31", "ANLAGE_32"] as const) {
        for (const groupId of ["p4", "p6"] as const) {
          it(
            "ost " + territory + " " + variantId + " " + groupId + "/1 half-time " + period.month,
            () => {
              const special2025 = variantId === "ANLAGE_32" && territory === "OST_TARIF_OST";
              const expectedBase = special2025
                ? (period.specialBaseCents ?? period.commonBaseCents)[groupId]
                : period.commonBaseCents[groupId];
              checkAdditionalReference({
                region: "ost",
                groupId,
                version: period.version,
                month: period.month,
                variantId,
                territory,
                stepId: "1",
                weeklyMinutes: (variantId === "ANLAGE_31" ? 2310 : 2340) / 2,
                baseCents: expectedBase,
                fixedCents: 1250,
                careCents: period.careCents,
              });
            },
          );
        }
      }
    }
  }
});
