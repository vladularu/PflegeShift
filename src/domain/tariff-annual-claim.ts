import { Temporal } from "@js-temporal/polyfill";
import { ValidationError, requireLocalDate, requireLocalMonth } from "./validation";

export type AnnualEntitlementReason =
  | "PAY"
  | "NONE"
  | "MATERNITY"
  | "PARENTAL_BIRTH_YEAR"
  | "SICK_PAY_SUPPLEMENT"
  | "MILITARY_RETURN"
  | "UNKNOWN";
export interface AnnualBasisMonth {
  readonly month: string;
  readonly componentsConfirmed: boolean;
  readonly baseCents: number | null;
  readonly fixedCents: number | null;
  readonly variableCents: number | null;
  readonly scheduledOvertimeCents: number | null;
  /** Days with eligible pay; periods covered only by Krankengeldzuschuss are excluded. */
  readonly paidCalendarDays: number | null;
}
export interface TariffAnnualClaim {
  readonly version: 1 | 2 | 3;
  readonly id: string;
  readonly year: number;
  readonly selection: {
    readonly packageId: string;
    readonly variant: string;
    readonly region: string;
    readonly group: string;
    readonly confirmed: boolean;
    /** V3 Caritas: explicitly verified historical group on 1 September. */
    readonly groupAtSeptember1Confirmed?: boolean;
  };
  readonly employment: {
    readonly start: string | null;
    readonly end: string | null;
    readonly confirmed: boolean;
    readonly takeover: {
      readonly immediate: boolean | null;
      readonly sameEmployer: boolean | null;
      readonly employedDecember1: boolean | null;
    };
  };
  readonly entitlements: readonly {
    readonly month: number;
    readonly reason: AnnualEntitlementReason;
  }[];
  readonly exceptions: {
    readonly birthYear: number | null;
    readonly payBeforeParentalLeave: boolean | null;
    readonly militaryReturnBeforeDecember1: boolean | null;
    /** V2: ATZ agreed by 20 May 2006 AND employment ended for retirement before December. */
    readonly tvlLegacyRetirementExit?: boolean | null;
  };
  readonly allocation: {
    /** Must be true for a takeover; profile integration also detects other split claims. */
    readonly required: boolean | null;
    readonly twelfthsNumerator: number | null;
    readonly twelfthsDenominator: number | null;
  };
  readonly basis: {
    readonly months: readonly AnnualBasisMonth[];
    readonly lastFullPayMonth: string | null;
    readonly parentalPartTime: boolean | null;
    readonly adjustedMonthlyCents: number | null;
    readonly takeoverMonthlyCents: number | null;
  };
}

const fail = (): never => {
  throw new ValidationError("Die Angaben zur tariflichen Sonderzahlung sind ungültig.");
};

export function isCaritasAnnualPackageId(value: string): boolean {
  return /^avr-caritas-p-(bw|bayern|mitte|nord|nrw|ost)$/u.test(value);
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail();
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== keys.length || keys.some((key) => !Object.hasOwn(raw, key)))
    return fail();
  return raw;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    return fail();
  return value;
}
function nullableInt(value: unknown, min: number, max: number) {
  return value === null ? null : integer(value, min, max);
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") return fail();
  return value;
}
function nullableBoolean(value: unknown) {
  return value === null ? null : boolean(value);
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)) return fail();
  return value;
}
function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail();
  integer(Number(value.slice(0, 4)), 1900, 4099);
  if (requireLocalDate(value) === value) return value;
  return fail();
}
function month(value: unknown): string {
  const result = requireLocalMonth(value);
  integer(Number(result.slice(0, 4)), 1900, 4099);
  return result;
}
const reasons: readonly AnnualEntitlementReason[] = [
  "PAY",
  "NONE",
  "MATERNITY",
  "PARENTAL_BIRTH_YEAR",
  "SICK_PAY_SUPPLEMENT",
  "MILITARY_RETURN",
  "UNKNOWN",
];

/** Independent personal contract, not public tariff data; returns a detached immutable snapshot. */
export function validateTariffAnnualClaim(value: unknown): TariffAnnualClaim {
  const raw = object(value, [
    "version",
    "id",
    "year",
    "selection",
    "employment",
    "entitlements",
    "exceptions",
    "allocation",
    "basis",
  ]);
  if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3) return fail();
  const s = object(raw.selection, [
    "packageId",
    "variant",
    "region",
    "group",
    "confirmed",
    ...(raw.version === 3 ? ["groupAtSeptember1Confirmed"] : []),
  ]);
  if (raw.version === 2 && s.packageId !== "tvl-kr-tdl") return fail();
  if (
    raw.version === 3 &&
    (typeof s.packageId !== "string" || !isCaritasAnnualPackageId(s.packageId))
  )
    return fail();
  const e = object(raw.employment, ["start", "end", "confirmed", "takeover"]);
  const t = object(e.takeover, ["immediate", "sameEmployer", "employedDecember1"]);
  const x = object(raw.exceptions, [
    "birthYear",
    "payBeforeParentalLeave",
    "militaryReturnBeforeDecember1",
    ...(raw.version === 2 ? ["tvlLegacyRetirementExit"] : []),
  ]);
  const a = object(raw.allocation, ["required", "twelfthsNumerator", "twelfthsDenominator"]);
  const b = object(raw.basis, [
    "months",
    "lastFullPayMonth",
    "parentalPartTime",
    "adjustedMonthlyCents",
    "takeoverMonthlyCents",
  ]);
  if (!Array.isArray(raw.entitlements) || raw.entitlements.length !== 12) return fail();
  const seen = new Set<number>();
  const entitlements = raw.entitlements
    .map((value) => {
      const row = object(value, ["month", "reason"]);
      const m = integer(row.month, 1, 12);
      if (seen.has(m) || !reasons.includes(row.reason as AnnualEntitlementReason)) return fail();
      seen.add(m);
      return Object.freeze({ month: m, reason: row.reason as AnnualEntitlementReason });
    })
    .sort((a, b) => a.month - b.month);
  if (!Array.isArray(b.months) || b.months.length > 36) return fail();
  const seenMonths = new Set<string>();
  const months = b.months
    .map((value): AnnualBasisMonth => {
      const row = object(value, [
        "month",
        "componentsConfirmed",
        "baseCents",
        "fixedCents",
        "variableCents",
        "scheduledOvertimeCents",
        "paidCalendarDays",
      ]);
      const m = month(row.month);
      if (seenMonths.has(m)) return fail();
      seenMonths.add(m);
      return Object.freeze({
        month: m,
        componentsConfirmed: boolean(row.componentsConfirmed),
        baseCents: nullableInt(row.baseCents, 0, 1_000_000_000),
        fixedCents: nullableInt(row.fixedCents, 0, 1_000_000_000),
        variableCents: nullableInt(row.variableCents, 0, 1_000_000_000),
        scheduledOvertimeCents: nullableInt(row.scheduledOvertimeCents, 0, 1_000_000_000),
        paidCalendarDays: nullableInt(
          row.paidCalendarDays,
          0,
          Temporal.PlainYearMonth.from(m).daysInMonth,
        ),
      });
    })
    .sort((a, b) => a.month.localeCompare(b.month));
  const start = date(e.start),
    end = date(e.end);
  if (start !== null && end !== null && end < start) return fail();
  const numerator = nullableInt(a.twelfthsNumerator, 0, 120_000);
  const denominator = nullableInt(a.twelfthsDenominator, 1, 10_000);
  if (numerator !== null && denominator !== null && numerator > 12 * denominator) return fail();
  return Object.freeze({
    version: raw.version,
    id: identifier(raw.id),
    year: integer(raw.year, 1900, 4099),
    selection: Object.freeze({
      packageId: identifier(s.packageId),
      variant: identifier(s.variant),
      region: identifier(s.region),
      group: identifier(s.group),
      confirmed: boolean(s.confirmed),
      ...(raw.version === 3
        ? { groupAtSeptember1Confirmed: boolean(s.groupAtSeptember1Confirmed) }
        : {}),
    }),
    employment: Object.freeze({
      start,
      end,
      confirmed: boolean(e.confirmed),
      takeover: Object.freeze({
        immediate: nullableBoolean(t.immediate),
        sameEmployer: nullableBoolean(t.sameEmployer),
        employedDecember1: nullableBoolean(t.employedDecember1),
      }),
    }),
    entitlements: Object.freeze(entitlements),
    exceptions: Object.freeze({
      birthYear: nullableInt(x.birthYear, 1900, 4099),
      payBeforeParentalLeave: nullableBoolean(x.payBeforeParentalLeave),
      militaryReturnBeforeDecember1: nullableBoolean(x.militaryReturnBeforeDecember1),
      ...(raw.version === 2
        ? { tvlLegacyRetirementExit: nullableBoolean(x.tvlLegacyRetirementExit) }
        : {}),
    }),
    allocation: Object.freeze({
      required: nullableBoolean(a.required),
      twelfthsNumerator: numerator,
      twelfthsDenominator: denominator,
    }),
    basis: Object.freeze({
      months: Object.freeze(months),
      lastFullPayMonth: b.lastFullPayMonth === null ? null : month(b.lastFullPayMonth),
      parentalPartTime: nullableBoolean(b.parentalPartTime),
      adjustedMonthlyCents: nullableInt(b.adjustedMonthlyCents, 0, 1_000_000_000),
      takeoverMonthlyCents: nullableInt(b.takeoverMonthlyCents, 0, 1_000_000_000),
    }),
  });
}
