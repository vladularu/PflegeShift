import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftMonthlyWithHourlyShift,
  type CaritasCareDraftMonthlyWithHourlyShiftInput,
  type CaritasConfirmedHourlyShiftLine,
} from "./caritas-care-draft-monthly-with-hourly-shift";

function load(region = "bw", version = "2025-07-01"): RuleTariffPackage {
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

function line(
  overrides: Partial<CaritasConfirmedHourlyShiftLine> = {},
): CaritasConfirmedHourlyShiftLine {
  return {
    lineId: "svc-02",
    serviceDate: "2025-10-02",
    allowanceType: "ALTERNATING_HOURLY",
    entitlement: "CONFIRMED_NONPERMANENT",
    payableWholeHours: 8,
    hoursConfirmed: true,
    monthlyAllocationConfirmed: true,
    categoryAndOverlapConfirmed: true,
    ...overrides,
  };
}

function input(
  overrides: Partial<CaritasCareDraftMonthlyWithHourlyShiftInput> = {},
): CaritasCareDraftMonthlyWithHourlyShiftInput {
  return {
    pkg: load(),
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
    confirmedHourlyShift: [
      line(),
      line({
        lineId: "svc-05",
        serviceDate: "2025-10-05",
        allowanceType: "SHIFT_HOURLY",
        payableWholeHours: 4,
      }),
    ],
    ...overrides,
  };
}

function run(overrides: Partial<CaritasCareDraftMonthlyWithHourlyShiftInput> = {}) {
  return calculateCaritasCareDraftMonthlyWithHourlyShift(input(overrides));
}

describe("Caritas DRAFT month with externally confirmed hourly shift allowances", () => {
  it("adds sourced whole-hour amounts once to the shared monthly basis", () => {
    const result = run();
    expect(result).toMatchObject({
      kind: "draft-known-monthly-components-with-hourly-shift",
      completeGross: false,
      packageId: "avr-caritas-p-bw",
      month: "2025-10",
      knownHourlyShiftSubtotalCents: 1412,
      knownSubtotalCents: 345894,
    });
    if (result.kind === "unavailable") throw new Error(result.reason);
    expect(result.positions.map(({ component, amountCents }) => [component, amountCents])).toEqual([
      ["table-base", 327186],
      ["care-allowance-12-3", 3500],
      ["care-allowance-12-4", 13796],
      ["confirmed-hourly-shift-allowance", 1176],
      ["confirmed-hourly-shift-allowance", 236],
    ]);
    const hourly = result.positions.filter(
      (position) => position.component === "confirmed-hourly-shift-allowance",
    );
    expect(hourly[0]).toMatchObject({
      lineId: "svc-02",
      serviceDate: "2025-10-02",
      allowanceType: "ALTERNATING_HOURLY",
      payableWholeHours: 8,
      rateCentsPerHour: 147,
      rateId: "caritas-bw-shift-32-2025-07-01",
      sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-bw-2025"],
    });
    expect(hourly[1]).toMatchObject({ allowanceType: "SHIFT_HOURLY", rateCentsPerHour: 59 });
    expect(result.excludedComponents).toEqual([
      "OTHER_SHIFT_ALLOWANCES",
      "TIME_PREMIUMS",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ]);
  });

  const regions = [
    ["bw", "BW", "2025-07-01", 344482],
    ["bayern", "BAYERN", "2025-07-01", 343482],
    ["mitte", "MITTE", "2025-07-01", 343482],
    ["nord", "NORD", "2025-07-01", 343482],
    ["nrw", "NRW", "2025-07-01", 343482],
    ["ost", "OST_TARIF_OST", "2025-01", 338806],
  ] as const;

  it.each(regions)(
    "matches Anlage 32 fixed amounts for RK %s",
    (region, regionId, version, base) => {
      expect(run({ pkg: load(region, version), regionId })).toMatchObject({
        knownHourlyShiftSubtotalCents: 1412,
        knownSubtotalCents: base + 1412,
      });
    },
  );

  it.each([
    ["bw", "BW", "2025-07-01", 344482],
    ["bayern", "BAYERN", "2025-07-01", 343482],
    ["mitte", "MITTE", "2025-07-01", 343482],
    ["nord", "NORD", "2025-07-01", 343482],
    ["nrw", "NRW", "2025-07-01", 343482],
    ["ost", "OST_TARIF_OST", "2025-01", 340387],
  ] as const)(
    "keeps the distinct Anlage 31 alternating rate for RK %s",
    (region, regionId, version, base) => {
      expect(
        run({
          pkg: load(region, version),
          regionId,
          variantId: "ANLAGE_31",
          weeklyMinutes: region === "bw" || region === "mitte" ? 2340 : 2310,
        }),
      ).toMatchObject({ knownHourlyShiftSubtotalCents: 1428, knownSubtotalCents: base + 1428 });
    },
  );

  it("prorates only the monthly basis for half-time", () => {
    expect(run({ weeklyMinutes: 1170 })).toMatchObject({
      knownHourlyShiftSubtotalCents: 1412,
      knownSubtotalCents: 173653,
    });
  });

  it("requires all external confirmations exactly and returns no partial amount", () => {
    for (const property of [
      "hoursConfirmed",
      "monthlyAllocationConfirmed",
      "categoryAndOverlapConfirmed",
    ] as const) {
      for (const value of [false, undefined, null, "true"]) {
        const result = run({
          confirmedHourlyShift: [line(), line({ lineId: "bad", [property]: value as boolean })],
        });
        expect(result.kind).toBe("unavailable");
        expect(result).not.toHaveProperty("positions");
        expect(result).not.toHaveProperty("knownSubtotalCents");
      }
    }
    expect(run({ confirmedHourlyShift: [line({ entitlement: "UNKNOWN" })] })).toMatchObject({
      kind: "unavailable",
      reason: "ENTITLEMENT_UNCONFIRMED",
      lineId: "svc-02",
    });
    expect(run({ confirmedHourlyShift: [line({ entitlement: "NOT_ENTITLED" })] })).toMatchObject({
      kind: "unavailable",
      reason: "NOT_ENTITLED",
    });
  });

  it("rejects missing, empty or malformed supplied lists and lines", () => {
    for (const value of [undefined, null, {}]) {
      expect(
        run({ confirmedHourlyShift: value as unknown as CaritasConfirmedHourlyShiftLine[] }),
      ).toMatchObject({
        kind: "unavailable",
        reason: "INVALID_HOURLY_SHIFT_LINES",
      });
    }
    expect(run({ confirmedHourlyShift: [] })).toMatchObject({
      kind: "unavailable",
      reason: "NO_CONFIRMED_HOURLY_SHIFT_LINES",
    });
    for (const value of [null, 2, []]) {
      expect(
        run({ confirmedHourlyShift: [value] as unknown as CaritasConfirmedHourlyShiftLine[] }),
      ).toMatchObject({
        kind: "unavailable",
        reason: "INVALID_HOURLY_SHIFT_LINE",
      });
    }
    for (const value of ["", " ", null, 2]) {
      expect(run({ confirmedHourlyShift: [line({ lineId: value as string })] })).toMatchObject({
        kind: "unavailable",
        reason: "INVALID_HOURLY_SHIFT_LINE_ID",
      });
    }
  });

  it("normalizes IDs and rejects repeated identities across both allowance types", () => {
    expect(
      run({
        confirmedHourlyShift: [
          line({ lineId: " id " }),
          line({ lineId: "id", serviceDate: "2025-10-05", allowanceType: "SHIFT_HOURLY" }),
        ],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "DUPLICATE_HOURLY_SHIFT_LINE", lineId: "id" });
  });

  it("requires dated lines in the selected month", () => {
    expect(
      run({ confirmedHourlyShift: [line({ serviceDate: null as unknown as string })] }),
    ).toMatchObject({
      kind: "unavailable",
      reason: "INVALID_DATE",
      lineId: "svc-02",
    });
    expect(run({ confirmedHourlyShift: [line({ serviceDate: "2025-11-02" })] })).toMatchObject({
      kind: "unavailable",
      reason: "HOURLY_SHIFT_OUTSIDE_MONTH",
    });
    for (const date of ["2025-10-32", "2025-10-2", "2025-10-02T12:00:00Z"]) {
      expect(run({ confirmedHourlyShift: [line({ serviceDate: date })] })).toMatchObject({
        kind: "unavailable",
        reason: "OUTSIDE_VALIDITY",
      });
    }
  });

  it("rejects partial, invalid or implausibly duplicated daily hours", () => {
    for (const hours of [0, -1, 0.5, 25, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(run({ confirmedHourlyShift: [line({ payableWholeHours: hours })] })).toMatchObject({
        kind: "unavailable",
        reason: "INVALID_WHOLE_HOURS",
      });
    }
    expect(
      run({
        confirmedHourlyShift: [
          line({ payableWholeHours: 20 }),
          line({ lineId: "second", allowanceType: "SHIFT_HOURLY", payableWholeHours: 5 }),
        ],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "DAILY_HOURS_EXCEEDED", lineId: "second" });
    expect(
      run({
        confirmedHourlyShift: [
          line({ payableWholeHours: 20 }),
          line({ lineId: "second", allowanceType: "SHIFT_HOURLY", payableWholeHours: 4 }),
        ],
      }),
    ).toMatchObject({ knownHourlyShiftSubtotalCents: 3176 });
  });

  it("keeps the common base, selection and DRAFT gates", () => {
    expect(run({ fullMonthEmploymentConfirmed: false }).kind).toBe("unavailable");
    expect(run({ fixedAllowanceEntitlement: "UNKNOWN" }).kind).toBe("unavailable");
    expect(run({ month: "2025-13" }).kind).toBe("unavailable");
    expect(run({ groupId: "P5" }).kind).toBe("unavailable");
    const pkg = load();
    pkg.status = "RELEASED" as RuleTariffPackage["status"];
    expect(run({ pkg })).toMatchObject({ kind: "unavailable", reason: "INVALID_PACKAGE" });
    expect(
      run({
        confirmedHourlyShift: [
          line({ allowanceType: "UNKNOWN" as CaritasConfirmedHourlyShiftLine["allowanceType"] }),
        ],
      }),
    ).toMatchObject({
      kind: "unavailable",
      reason: "UNKNOWN_ALLOWANCE_TYPE",
    });
  });

  it("ignores injected line selections and preserves caller data", () => {
    const injected = {
      ...line({ lineId: " id " }),
      pkg: load("ost", "2025-01"),
      regionId: "OST_TARIF_OST",
      variantId: "ANLAGE_31",
      month: "2025-11",
    };
    const selection = input({ confirmedHourlyShift: [injected] });
    const snapshot = structuredClone(selection);
    const result = calculateCaritasCareDraftMonthlyWithHourlyShift(selection);
    expect(result).toMatchObject({
      packageId: "avr-caritas-p-bw",
      month: "2025-10",
      knownHourlyShiftSubtotalCents: 1176,
    });
    if (result.kind === "unavailable") throw new Error(result.reason);
    expect(result.positions.at(-1)).toMatchObject({ lineId: "id", rateCentsPerHour: 147 });
    expect(selection).toEqual(snapshot);
  });
});
