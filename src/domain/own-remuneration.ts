import { UserFacingError } from "./errors";

export type OwnRate =
  | { readonly kind: "percent"; readonly basisPoints: number }
  | { readonly kind: "hourly"; readonly centsPerHour: number };
export type OwnPartialMonth = "unconfirmed" | "calendar-days";
export interface OwnValidity {
  readonly validFrom: string;
  readonly validTo: string | null;
}
export interface OwnTimePremium {
  readonly id: string;
  readonly type: "night" | "saturday" | "sunday" | "holiday";
  /** null means all of the qualifying calendar day; equal endpoints are invalid. */
  readonly window: { readonly startMinute: number; readonly endMinute: number } | null;
  readonly rate: OwnRate;
}
export interface OwnFixedAllowance extends OwnValidity {
  readonly id: string;
  readonly title: string;
  readonly monthlyCents: number;
  readonly partialMonth: OwnPartialMonth;
}
export interface OwnSpecialPayment extends OwnValidity {
  readonly id: string;
  readonly title: string;
  readonly payoutMonth: number;
  readonly entitlementMonths: number | null;
  readonly amount:
    | { readonly kind: "fixed"; readonly cents: number }
    | {
        readonly kind: "percent";
        readonly basisPoints: number;
        readonly confirmedBasisCents: number | null;
      };
}
/** Personal inputs only. Never part of a public tariff package or a tariff override. */
export interface OwnRemunerationConfiguration {
  readonly base:
    | {
        readonly kind: "monthly";
        readonly personalCents: number;
        readonly partialMonth: OwnPartialMonth;
      }
    | { readonly kind: "hourly"; readonly centsPerHour: number };
  readonly percentageBasisHourlyCents: number | null;
  readonly timePremiums: {
    readonly combination: "add" | "highest";
    readonly rules: readonly OwnTimePremium[];
  } | null;
  readonly overtime: { readonly basePayIncluded: boolean; readonly premium: OwnRate | null } | null;
  readonly fixedAllowances: readonly OwnFixedAllowance[];
  readonly specialPayments: readonly OwnSpecialPayment[];
}

export class OwnRemunerationError extends UserFacingError {
  constructor() {
    super("Die Bausteine der eigenen Vergütung sind ungültig oder werden noch nicht unterstützt.");
    this.name = "OwnRemunerationError";
  }
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new OwnRemunerationError();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    throw new OwnRemunerationError();
  return result;
}
function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw new OwnRemunerationError();
  return value as number;
}
function choice<const T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new OwnRemunerationError();
  return value as T;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/u.test(value))
    throw new OwnRemunerationError();
  return value;
}
function title(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 100 ||
    value.trim() !== value ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new OwnRemunerationError();
  return value;
}
function date(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value < "1900-01-01" ||
    !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw new OwnRemunerationError();
  return value;
}
function validity(raw: Record<string, unknown>): OwnValidity {
  const validFrom = date(raw.validFrom);
  const validTo = raw.validTo === null ? null : date(raw.validTo);
  if (validTo !== null && validTo < validFrom) throw new OwnRemunerationError();
  return { validFrom, validTo };
}
function partialMonth(value: unknown): OwnPartialMonth {
  return choice(value, ["unconfirmed", "calendar-days"]);
}
function rate(value: unknown): OwnRate {
  if (typeof value !== "object" || value === null || !("kind" in value))
    throw new OwnRemunerationError();
  if (value.kind === "percent") {
    const raw = object(value, ["kind", "basisPoints"]);
    return Object.freeze({ kind: "percent", basisPoints: integer(raw.basisPoints, 0, 100_000) });
  }
  const raw = object(value, ["kind", "centsPerHour"]);
  if (raw.kind !== "hourly") throw new OwnRemunerationError();
  return Object.freeze({ kind: "hourly", centsPerHour: integer(raw.centsPerHour, 0, 1_000_000) });
}
function list<T extends { readonly id: string }>(
  value: unknown,
  parse: (item: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value) || value.length > 32) throw new OwnRemunerationError();
  const result = value.map(parse);
  if (new Set(result.map((item) => item.id)).size !== result.length)
    throw new OwnRemunerationError();
  return Object.freeze(result);
}
function base(value: unknown): OwnRemunerationConfiguration["base"] {
  if (typeof value !== "object" || value === null || !("kind" in value))
    throw new OwnRemunerationError();
  if (value.kind === "monthly") {
    const raw = object(value, ["kind", "personalCents", "partialMonth"]);
    return Object.freeze({
      kind: "monthly",
      personalCents: integer(raw.personalCents, 1, 10_000_000),
      partialMonth: partialMonth(raw.partialMonth),
    });
  }
  const raw = object(value, ["kind", "centsPerHour"]);
  if (raw.kind !== "hourly") throw new OwnRemunerationError();
  return Object.freeze({ kind: "hourly", centsPerHour: integer(raw.centsPerHour, 1, 1_000_000) });
}
function premium(value: unknown): OwnTimePremium {
  const raw = object(value, ["id", "type", "window", "rate"]);
  const type = choice(raw.type, ["night", "saturday", "sunday", "holiday"]);
  let window = null;
  if (raw.window !== null) {
    const range = object(raw.window, ["startMinute", "endMinute"]);
    const startMinute = integer(range.startMinute, 0, 1439);
    const endMinute = integer(range.endMinute, 0, 1439);
    if (startMinute === endMinute) throw new OwnRemunerationError();
    window = Object.freeze({ startMinute, endMinute });
  }
  if (type === "night" && window === null) throw new OwnRemunerationError();
  return Object.freeze({ id: id(raw.id), type, window, rate: rate(raw.rate) });
}
function allowance(value: unknown): OwnFixedAllowance {
  const raw = object(value, [
    "id",
    "title",
    "monthlyCents",
    "partialMonth",
    "validFrom",
    "validTo",
  ]);
  return Object.freeze({
    id: id(raw.id),
    title: title(raw.title),
    monthlyCents: integer(raw.monthlyCents, 0, 10_000_000),
    partialMonth: partialMonth(raw.partialMonth),
    ...validity(raw),
  });
}
function specialPayment(value: unknown): OwnSpecialPayment {
  const raw = object(value, [
    "id",
    "title",
    "payoutMonth",
    "entitlementMonths",
    "amount",
    "validFrom",
    "validTo",
  ]);
  const entry = raw.amount;
  if (typeof entry !== "object" || entry === null || !("kind" in entry))
    throw new OwnRemunerationError();
  let amount: OwnSpecialPayment["amount"];
  if (entry.kind === "fixed") {
    const fixed = object(entry, ["kind", "cents"]);
    amount = Object.freeze({ kind: "fixed", cents: integer(fixed.cents, 0, 100_000_000) });
  } else {
    const percent = object(entry, ["kind", "basisPoints", "confirmedBasisCents"]);
    if (percent.kind !== "percent") throw new OwnRemunerationError();
    amount = Object.freeze({
      kind: "percent",
      basisPoints: integer(percent.basisPoints, 0, 100_000),
      confirmedBasisCents:
        percent.confirmedBasisCents === null
          ? null
          : integer(percent.confirmedBasisCents, 0, 100_000_000),
    });
  }
  return Object.freeze({
    id: id(raw.id),
    title: title(raw.title),
    payoutMonth: integer(raw.payoutMonth, 1, 12),
    entitlementMonths:
      raw.entitlementMonths === null ? null : integer(raw.entitlementMonths, 0, 12),
    amount,
    ...validity(raw),
  });
}

export function validateOwnRemuneration(value: unknown): OwnRemunerationConfiguration {
  const raw = object(value, [
    "base",
    "percentageBasisHourlyCents",
    "timePremiums",
    "overtime",
    "fixedAllowances",
    "specialPayments",
  ]);
  const selectedBase = base(raw.base);
  const percentageBasisHourlyCents =
    raw.percentageBasisHourlyCents === null
      ? null
      : integer(raw.percentageBasisHourlyCents, 1, 1_000_000);
  if (selectedBase.kind === "hourly" && percentageBasisHourlyCents !== null)
    throw new OwnRemunerationError();
  let timePremiums = null;
  if (raw.timePremiums !== null) {
    const premiums = object(raw.timePremiums, ["combination", "rules"]);
    const rules = list(premiums.rules, premium);
    if (!rules.length) throw new OwnRemunerationError();
    timePremiums = Object.freeze({
      combination: choice(premiums.combination, ["add", "highest"]),
      rules,
    });
  }
  let overtime = null;
  if (raw.overtime !== null) {
    const extra = object(raw.overtime, ["basePayIncluded", "premium"]);
    if (typeof extra.basePayIncluded !== "boolean") throw new OwnRemunerationError();
    overtime = Object.freeze({
      basePayIncluded: extra.basePayIncluded,
      premium: extra.premium === null ? null : rate(extra.premium),
    });
  }
  return Object.freeze({
    base: selectedBase,
    percentageBasisHourlyCents,
    timePremiums,
    overtime,
    fixedAllowances: list(raw.fixedAllowances, allowance),
    specialPayments: list(raw.specialPayments, specialPayment),
  });
}
