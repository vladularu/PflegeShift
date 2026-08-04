import { requireLocalDate } from "@/domain/validation";

export type RouteParam = string | string[] | undefined;

export type ParsedRouteParam<T> =
  | { readonly status: "invalid" }
  | { readonly status: "missing" }
  | { readonly status: "valid"; readonly value: T };

const INVALID = Object.freeze({ status: "invalid" } as const);
const MISSING = Object.freeze({ status: "missing" } as const);

function parseSingle(value: RouteParam): ParsedRouteParam<string> {
  if (value === undefined) return MISSING;
  if (typeof value !== "string" || value.length === 0) return INVALID;
  return Object.freeze({ status: "valid", value });
}

export function parseLocalDateRouteParam(value: RouteParam): ParsedRouteParam<string> {
  const single = parseSingle(value);
  if (single.status !== "valid") return single;
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(single.value)) {
    return INVALID;
  }
  try {
    return Object.freeze({
      status: "valid",
      value: requireLocalDate(single.value),
    });
  } catch {
    return INVALID;
  }
}

export function parseMonthRouteParam(value: RouteParam): ParsedRouteParam<string> {
  const single = parseSingle(value);
  if (single.status !== "valid") return single;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(single.value)) return INVALID;
  try {
    requireLocalDate(`${single.value}-01`);
    return Object.freeze({ status: "valid", value: single.value });
  } catch {
    return INVALID;
  }
}

export function parseEnumRouteParam<const T extends string>(
  value: RouteParam,
  allowed: readonly T[],
): ParsedRouteParam<T> {
  const single = parseSingle(value);
  if (single.status !== "valid") return single;
  const parsed = allowed.find((candidate) => candidate === single.value);
  return parsed === undefined ? INVALID : Object.freeze({ status: "valid", value: parsed });
}

export function parseIdentifierRouteParam(value: RouteParam): ParsedRouteParam<string> {
  const single = parseSingle(value);
  if (single.status !== "valid") return single;
  return /^[A-Za-z0-9._:-]{1,128}$/.test(single.value)
    ? Object.freeze({ status: "valid", value: single.value })
    : INVALID;
}
