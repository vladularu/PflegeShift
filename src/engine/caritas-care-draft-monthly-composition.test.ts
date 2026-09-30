import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { CaritasConfirmedTimePremiumLine } from "./caritas-care-draft-monthly-with-time-premiums";
import type { CaritasConfirmedOvertimeLine } from "./caritas-care-draft-monthly-with-overtime";
import type { CaritasConfirmedHourlyShiftLine } from "./caritas-care-draft-monthly-with-hourly-shift";
import {
  calculateCaritasCareDraftMonthlyComposition,
  type CaritasCareDraftMonthlyCompositionInput,
} from "./caritas-care-draft-monthly-composition";

function load(region: string, version = "2025-07-01"): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function premium(
  lineId: string,
  serviceDate: string,
  premiumType: CaritasConfirmedTimePremiumLine["premiumType"],
  payableWholeHours: number,
): CaritasConfirmedTimePremiumLine {
  return {
    lineId,
    serviceDate,
    premiumType,
    payableWholeHours,
    entitlement: "CONFIRMED_CASH",
    hoursConfirmed: true,
    categoryAndOverlapConfirmed: true,
  };
}

function overtime(
  lineId: string,
  serviceDate: string,
  payableWholeHours: number,
): CaritasConfirmedOvertimeLine {
  return {
    lineId,
    serviceDate,
    payableWholeHours,
    overtimeConfirmed: true,
    baseEntitlement: "CONFIRMED_CASH",
    premiumEntitlement: "CONFIRMED_CASH",
    hoursConfirmed: true,
    monthlyAllocationConfirmed: true,
  };
}

function hourlyShift(
  lineId: string,
  serviceDate: string,
  allowanceType: CaritasConfirmedHourlyShiftLine["allowanceType"],
  payableWholeHours: number,
): CaritasConfirmedHourlyShiftLine {
  return {
    lineId,
    serviceDate,
    allowanceType,
    payableWholeHours,
    entitlement: "CONFIRMED_NONPERMANENT",
    hoursConfirmed: true,
    monthlyAllocationConfirmed: true,
    categoryAndOverlapConfirmed: true,
  };
}

function input(
  overrides: Partial<CaritasCareDraftMonthlyCompositionInput> = {},
): CaritasCareDraftMonthlyCompositionInput {
  return {
    pkg: load("bw"),
    month: "2025-10",
    variantId: "ANLAGE_32",
    regionId: "BW",
    groupId: "P6",
    stepId: "3",
    weeklyMinutes: 2340,
    fullMonthEmploymentConfirmed: true,
    fullMonthlyBaseEntitlementConfirmed: true,
    fixedAllowanceEntitlement: "CONFIRMED",
    careAllowanceEntitlement: "CONFIRMED",
    monthlyShift: {
      shiftAllowanceType: "ALTERNATING_MONTHLY",
      shiftEntitlement: "CONFIRMED_FULL_MONTH",
      fullMonthWeeklyTimeConfirmed: true,
    },
    confirmedHourlyShift: [],
    confirmedPremiums: [
      premium("svc-02", "2025-10-02", "NIGHT", 8),
      premium("svc-05", "2025-10-05", "SUNDAY", 4),
    ],
    confirmedOvertime: [overtime("svc-02", "2025-10-02", 3), overtime("svc-05", "2025-10-05", 2)],
    monthlyCompositionConfirmed: true,
    ...overrides,
  };
}

function run(overrides: Partial<CaritasCareDraftMonthlyCompositionInput> = {}) {
  return calculateCaritasCareDraftMonthlyComposition(input(overrides));
}

describe("Caritas DRAFT composition of known monthly positions", () => {
  it("counts the monthly basis once and preserves separately sourced shift, time and overtime positions", () => {
    const result = run();
    expect(result).toMatchObject({
      kind: "draft-known-monthly-composition",
      completeGross: false,
      packageId: "avr-caritas-p-bw",
      month: "2025-10",
      knownBaseAndCareSubtotalCents: 344482,
      knownMonthlyShiftSubtotalCents: 25000,
      knownTimePremiumSubtotalCents: 5016,
      knownOvertimeBaseSubtotalCents: 9645,
      knownOvertimePremiumSubtotalCents: 2895,
      knownOvertimeSubtotalCents: 12540,
      knownSubtotalCents: 387038,
    });
    if (result.kind === "unavailable") throw new Error(result.reason);
    expect(result.positions.map(({ component, amountCents }) => [component, amountCents])).toEqual([
      ["table-base", 327186],
      ["care-allowance-12-3", 3500],
      ["care-allowance-12-4", 13796],
      ["monthly-shift-allowance", 25000],
      ["confirmed-time-premium", 3088],
      ["confirmed-time-premium", 1928],
      ["confirmed-overtime-base", 5787],
      ["confirmed-overtime-premium", 1737],
      ["confirmed-overtime-base", 3858],
      ["confirmed-overtime-premium", 1158],
    ]);
    expect(result.positions.filter((position) => position.component === "table-base")).toHaveLength(
      1,
    );
    expect(result.positions.reduce((sum, position) => sum + position.amountCents, 0)).toBe(387038);
    expect(result.excludedComponents).toEqual([
      "OTHER_SHIFT_ALLOWANCES",
      "OTHER_TIME_PREMIUMS",
      "OTHER_OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ]);
    for (const position of result.positions) expect(position.sourceIds.length).toBeGreaterThan(0);
    const night = result.positions.find(
      (position) =>
        position.component === "confirmed-time-premium" && position.premiumType === "NIGHT",
    );
    expect(night).toMatchObject({
      lineId: "svc-02",
      rateCentsPerHour: 386,
      tableSourceIds: expect.any(Array),
      workingTimeSourceIds: expect.any(Array),
      rateSourceIds: expect.any(Array),
    });
    const cashBase = result.positions.find(
      (position) => position.component === "confirmed-overtime-base",
    );
    expect(cashBase).toMatchObject({
      lineId: "svc-02",
      rateCentsPerHour: 1929,
      hourlyValues: { totalCentsPerHour: 2508 },
    });
  });

  it.each([
    ["bw", "BW", "2025-07-01", 344482, 5016, 12540, 387038],
    ["bayern", "BAYERN", "2025-07-01", 343482, 5016, 12540, 386038],
    ["mitte", "MITTE", "2025-07-01", 343482, 5016, 12540, 386038],
    ["nord", "NORD", "2025-07-01", 343482, 5016, 12540, 386038],
    ["nrw", "NRW", "2025-07-01", 343482, 5016, 12540, 386038],
    ["ost", "OST_TARIF_OST", "2025-01", 338806, 4944, 12365, 381115],
  ] as const)(
    "matches the fixed October 2025 reference for RK %s",
    (region, regionId, version, monthly, time, cash, total) => {
      expect(run({ pkg: load(region, version), regionId })).toMatchObject({
        knownBaseAndCareSubtotalCents: monthly,
        knownMonthlyShiftSubtotalCents: 25000,
        knownTimePremiumSubtotalCents: time,
        knownOvertimeSubtotalCents: cash,
        knownSubtotalCents: total,
      });
    },
  );

  it("applies the half-time quote only to monthly table/care/shift amounts", () => {
    expect(run({ weeklyMinutes: 1170 })).toMatchObject({
      knownBaseAndCareSubtotalCents: 172241,
      knownMonthlyShiftSubtotalCents: 12500,
      knownTimePremiumSubtotalCents: 5016,
      knownOvertimeSubtotalCents: 12540,
      knownSubtotalCents: 202297,
    });
  });

  it("retains Bavaria Anlage 31 38.5h selection for all included components", () => {
    expect(
      run({ pkg: load("bayern"), variantId: "ANLAGE_31", regionId: "BAYERN", weeklyMinutes: 2310 }),
    ).toMatchObject({
      knownTimePremiumSubtotalCents: 5084,
      knownOvertimeSubtotalCents: 12710,
      knownSubtotalCents: 386276,
    });
  });

  it("marks explicitly omitted additions instead of claiming a complete zero entitlement", () => {
    const result = run({ monthlyShift: null, confirmedPremiums: [], confirmedOvertime: [] });
    expect(result).toMatchObject({
      kind: "draft-known-monthly-composition",
      completeGross: false,
      knownSubtotalCents: 344482,
      knownMonthlyShiftSubtotalCents: 0,
      knownTimePremiumSubtotalCents: 0,
      knownOvertimeSubtotalCents: 0,
    });
    if (result.kind === "unavailable") throw new Error(result.reason);
    expect(result.positions).toHaveLength(3);
    expect(result.excludedComponents).toEqual([
      "SHIFT_ALLOWANCES",
      "TIME_PREMIUMS",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ]);
    expect(run({ confirmedPremiums: [] })).toMatchObject({
      knownSubtotalCents: 382022,
      excludedComponents: [
        "OTHER_SHIFT_ALLOWANCES",
        "TIME_PREMIUMS",
        "OTHER_OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ],
    });
  });

  it("requires exact external confirmation of the composed month's allocation and non-duplication", () => {
    for (const value of [false, undefined, null, "true"]) {
      const result = run({ monthlyCompositionConfirmed: value as boolean });
      expect(result).toMatchObject({
        kind: "unavailable",
        reason: "MONTHLY_COMPOSITION_UNCONFIRMED",
      });
      expect(result).not.toHaveProperty("knownSubtotalCents");
    }
  });

  it("normalizes time-line IDs before rejecting duplicates within that component family", () => {
    const first = premium(" id ", "2025-10-02", "NIGHT", 1);
    expect(
      run({ confirmedPremiums: [first, premium("id", "2025-10-05", "SUNDAY", 1)] }),
    ).toMatchObject({ kind: "unavailable", reason: "DUPLICATE_PREMIUM_LINE", lineId: "id" });
    expect(
      run({
        confirmedOvertime: [overtime(" id ", "2025-10-02", 1), overtime("id", "2025-10-05", 1)],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "DUPLICATE_OVERTIME_LINE", lineId: "id" });
    expect(run({ confirmedPremiums: [premium(" ", "2025-10-02", "NIGHT", 1)] })).toMatchObject({
      kind: "unavailable",
      reason: "INVALID_PREMIUM_LINE_ID",
    });
  });

  it("fails closed for malformed lists and supplied positions, without throwing", () => {
    for (const value of [undefined, null, {}]) {
      expect(
        run({ confirmedPremiums: value as unknown as CaritasConfirmedTimePremiumLine[] }),
      ).toMatchObject({ kind: "unavailable", reason: "INVALID_COMPONENT_LINES" });
      expect(
        run({ confirmedOvertime: value as unknown as CaritasConfirmedOvertimeLine[] }),
      ).toMatchObject({ kind: "unavailable", reason: "INVALID_COMPONENT_LINES" });
    }
    for (const value of [null, 2])
      expect(
        run({ confirmedPremiums: [value] as unknown as CaritasConfirmedTimePremiumLine[] }),
      ).toMatchObject({ kind: "unavailable", reason: "INVALID_PREMIUM_LINE" });
    expect(run({ monthlyShift: undefined })).toMatchObject({
      kind: "unavailable",
      reason: "INVALID_MONTHLY_SHIFT",
    });
    expect(
      run({
        confirmedPremiums: [
          { ...premium("date", "2025-10-02", "NIGHT", 1), serviceDate: null as unknown as string },
        ],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "INVALID_DATE", lineId: "date" });
  });

  it("rejects an unavailable supplied shift, time or overtime component without a partial success", () => {
    const cases: Partial<CaritasCareDraftMonthlyCompositionInput>[] = [
      {
        monthlyShift: {
          shiftAllowanceType: "ALTERNATING_MONTHLY",
          shiftEntitlement: "UNKNOWN",
          fullMonthWeeklyTimeConfirmed: true,
        },
      },
      {
        confirmedPremiums: [
          { ...premium("night", "2025-10-02", "NIGHT", 8), categoryAndOverlapConfirmed: false },
        ],
      },
      {
        confirmedOvertime: [
          { ...overtime("cash", "2025-10-02", 3), monthlyAllocationConfirmed: false },
        ],
      },
      { fixedAllowanceEntitlement: "UNKNOWN" },
      { fullMonthEmploymentConfirmed: false },
    ];
    for (const data of cases) {
      const result = run(data);
      expect(result.kind).toBe("unavailable");
      expect(result).not.toHaveProperty("knownSubtotalCents");
      expect(result).not.toHaveProperty("positions");
    }
  });

  it("retains month, date, group and DRAFT package restrictions", () => {
    expect(run({ confirmedPremiums: [premium("wrong", "2025-11-02", "NIGHT", 1)] })).toMatchObject({
      kind: "unavailable",
      reason: "PREMIUM_OUTSIDE_MONTH",
    });
    expect(run({ confirmedOvertime: [overtime("wrong", "2025-11-02", 1)] })).toMatchObject({
      kind: "unavailable",
      reason: "OVERTIME_OUTSIDE_MONTH",
    });
    expect(run({ month: "2025-13" })).toMatchObject({
      kind: "unavailable",
      reason: "INVALID_MONTH",
    });
    expect(run({ groupId: "P5" }).kind).toBe("unavailable");
    const pkg = load("bw");
    pkg.status = "RELEASED" as RuleTariffPackage["status"];
    expect(run({ pkg })).toMatchObject({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });

  it("binds all partial helpers to the outer selection and does not mutate supplied data", () => {
    const selection = input();
    const snapshot = structuredClone(selection);
    expect(calculateCaritasCareDraftMonthlyComposition(selection).kind).toBe(
      "draft-known-monthly-composition",
    );
    expect(selection).toEqual(snapshot);
    const injected = {
      ...selection.monthlyShift!,
      pkg: load("ost", "2025-01"),
      regionId: "OST_TARIF_OST",
      month: "2025-11",
    };
    expect(run({ monthlyShift: injected })).toMatchObject({
      packageId: "avr-caritas-p-bw",
      month: "2025-10",
      knownSubtotalCents: 387038,
    });
    expect(
      run({ fixedAllowanceEntitlement: "NOT_ENTITLED", careAllowanceEntitlement: "NOT_ENTITLED" }),
    ).toMatchObject({ knownBaseAndCareSubtotalCents: 327186, knownSubtotalCents: 369742 });
  });
  it("combines hourly shift, time and overtime with one sourced monthly basis", () => {
    const result = run({
      monthlyShift: null,
      confirmedHourlyShift: [
        hourlyShift("svc-02", "2025-10-02", "ALTERNATING_HOURLY", 8),
        hourlyShift("svc-05", "2025-10-05", "SHIFT_HOURLY", 4),
      ],
    });
    expect(result).toMatchObject({
      kind: "draft-known-monthly-composition",
      completeGross: false,
      knownBaseAndCareSubtotalCents: 344482,
      knownMonthlyShiftSubtotalCents: 0,
      knownHourlyShiftSubtotalCents: 1412,
      knownTimePremiumSubtotalCents: 5016,
      knownOvertimeSubtotalCents: 12540,
      knownSubtotalCents: 363450,
    });
    if (result.kind === "unavailable") throw new Error(result.reason);
    expect(result.positions.filter((p) => p.component === "table-base")).toHaveLength(1);
    expect(result.positions.filter((p) => p.component === "monthly-shift-allowance")).toHaveLength(
      0,
    );
    expect(
      result.positions.filter((p) => p.component === "confirmed-hourly-shift-allowance"),
    ).toMatchObject([
      {
        lineId: "svc-02",
        amountCents: 1176,
        rateCentsPerHour: 147,
        rateId: "caritas-bw-shift-32-2025-07-01",
      },
      { lineId: "svc-05", amountCents: 236, rateCentsPerHour: 59 },
    ]);
    expect(result.positions.reduce((sum, p) => sum + p.amountCents, 0)).toBe(363450);
    expect(result.excludedComponents[0]).toBe("OTHER_SHIFT_ALLOWANCES");
    for (const p of result.positions) expect(p.sourceIds.length).toBeGreaterThan(0);
  });

  it.each([
    ["bw", "BW", "2025-07-01", 363450],
    ["bayern", "BAYERN", "2025-07-01", 362450],
    ["mitte", "MITTE", "2025-07-01", 362450],
    ["nord", "NORD", "2025-07-01", 362450],
    ["nrw", "NRW", "2025-07-01", 362450],
    ["ost", "OST_TARIF_OST", "2025-01", 357527],
  ] as const)(
    "matches the hourly-shift composition reference for RK %s",
    (region, regionId, version, total) => {
      expect(
        run({
          pkg: load(region, version),
          regionId,
          monthlyShift: null,
          confirmedHourlyShift: [
            hourlyShift("svc-02", "2025-10-02", "ALTERNATING_HOURLY", 8),
            hourlyShift("svc-05", "2025-10-05", "SHIFT_HOURLY", 4),
          ],
        }),
      ).toMatchObject({ knownHourlyShiftSubtotalCents: 1412, knownSubtotalCents: total });
    },
  );

  it("keeps hourly allowances unprorated and selects Anlage 31's distinct rate", () => {
    const additions = {
      monthlyShift: null,
      confirmedHourlyShift: [
        hourlyShift("svc-02", "2025-10-02", "ALTERNATING_HOURLY", 8),
        hourlyShift("svc-05", "2025-10-05", "SHIFT_HOURLY", 4),
      ],
    };
    expect(run({ ...additions, weeklyMinutes: 1170 })).toMatchObject({
      knownBaseAndCareSubtotalCents: 172241,
      knownHourlyShiftSubtotalCents: 1412,
      knownSubtotalCents: 191209,
    });
    expect(
      run({
        ...additions,
        pkg: load("bayern"),
        regionId: "BAYERN",
        variantId: "ANLAGE_31",
        weeklyMinutes: 2310,
      }),
    ).toMatchObject({
      knownHourlyShiftSubtotalCents: 1428,
      knownTimePremiumSubtotalCents: 5084,
      knownOvertimeSubtotalCents: 12710,
      knownSubtotalCents: 362704,
    });
  });

  it("leaves mixed monthly and hourly shift forms outside this DRAFT contract", () => {
    for (const monthlyType of ["ALTERNATING_MONTHLY", "SHIFT_MONTHLY"] as const) {
      for (const hourlyType of ["ALTERNATING_HOURLY", "SHIFT_HOURLY"] as const) {
        const result = run({
          monthlyShift: {
            shiftAllowanceType: monthlyType,
            shiftEntitlement: "CONFIRMED_FULL_MONTH",
            fullMonthWeeklyTimeConfirmed: true,
          },
          confirmedHourlyShift: [hourlyShift("svc-02", "2025-10-02", hourlyType, 8)],
        });
        expect(result).toMatchObject({
          kind: "unavailable",
          reason: "MIXED_SHIFT_FORMS_UNSUPPORTED",
        });
        expect(result).not.toHaveProperty("positions");
        expect(result).not.toHaveProperty("knownSubtotalCents");
      }
    }
  });

  it("rejects implicit omissions and unavailable hourly claims without partial success", () => {
    for (const value of [undefined, null, {}]) {
      expect(
        run({ confirmedHourlyShift: value as unknown as CaritasConfirmedHourlyShiftLine[] }),
      ).toMatchObject({
        kind: "unavailable",
        reason: "INVALID_COMPONENT_LINES",
      });
    }
    const good = hourlyShift("svc-02", "2025-10-02", "ALTERNATING_HOURLY", 8);
    const cases: readonly CaritasConfirmedHourlyShiftLine[][] = [
      [good, { ...good, lineId: "bad", categoryAndOverlapConfirmed: false }],
      [good, { ...good, lineId: "bad", monthlyAllocationConfirmed: false }],
      [good, { ...good, lineId: "bad", entitlement: "UNKNOWN" }],
      [good, { ...good, lineId: " svc-02 ", allowanceType: "SHIFT_HOURLY" }],
      [good, { ...good, lineId: "bad", serviceDate: "2025-11-02" }],
    ];
    for (const lines of cases) {
      const result = run({ monthlyShift: null, confirmedHourlyShift: lines });
      expect(result.kind).toBe("unavailable");
      expect(result).not.toHaveProperty("positions");
      expect(result).not.toHaveProperty("knownSubtotalCents");
    }
    expect(run()).toMatchObject({ knownHourlyShiftSubtotalCents: 0, knownSubtotalCents: 387038 });
  });

  it("binds hourly positions to the outer selection and preserves caller data", () => {
    const injected = {
      ...hourlyShift(" svc-02 ", "2025-10-02", "ALTERNATING_HOURLY", 8),
      pkg: load("ost", "2025-01"),
      regionId: "OST_TARIF_OST",
      variantId: "ANLAGE_31",
      month: "2025-11",
    };
    const selection = input({ monthlyShift: null, confirmedHourlyShift: [injected] });
    const snapshot = structuredClone(selection);
    const result = calculateCaritasCareDraftMonthlyComposition(selection);
    expect(result).toMatchObject({
      packageId: "avr-caritas-p-bw",
      month: "2025-10",
      knownHourlyShiftSubtotalCents: 1176,
      knownSubtotalCents: 363214,
    });
    if (result.kind === "unavailable") throw new Error(result.reason);
    expect(
      result.positions.find((p) => p.component === "confirmed-hourly-shift-allowance"),
    ).toMatchObject({
      lineId: "svc-02",
      rateCentsPerHour: 147,
      rateId: "caritas-bw-shift-32-2025-07-01",
    });
    expect(selection).toEqual(snapshot);
  });
});
