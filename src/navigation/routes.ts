import {
  parseIdentifierRouteParam,
  parseLocalDateRouteParam,
  parseMonthRouteParam,
} from "@/navigation/route-params";

export type SettingsInfoSection =
  "STORAGE" | "CALCULATION" | "ABOUT" | "TVOED_ALLOWANCE" | "CARE_ALLOWANCE";

export const TAB_ROUTES = Object.freeze([
  { key: "calendar", route: "/" },
  { key: "analysis", route: "/analysis" },
  { key: "templates", route: "/templates" },
  { key: "more", route: "/more" },
] as const);

function requireValid<T>(
  parsed: { readonly status: "invalid" | "missing" | "valid"; readonly value?: T },
  label: string,
): T {
  if (parsed.status !== "valid") throw new Error(`${label} ist ungültig.`);
  return parsed.value as T;
}

function requireDate(date: string): string {
  return requireValid(parseLocalDateRouteParam(date), "Datum");
}

function requireMonth(month: string): string {
  return requireValid(parseMonthRouteParam(month), "Monat");
}

function requireIdentifier(id: string): string {
  return requireValid(parseIdentifierRouteParam(id), "ID");
}

export function dayDetailsRoute(date: string) {
  return Object.freeze({
    pathname: "/day-details" as const,
    params: Object.freeze({ date: requireDate(date) }),
  });
}

export function quickAddRoute(date: string) {
  return Object.freeze({
    pathname: "/quick-add" as const,
    params: Object.freeze({ date: requireDate(date) }),
  });
}

export function shiftSelectionRoute(date: string) {
  return Object.freeze({
    pathname: "/shift-selection" as const,
    params: Object.freeze({ date: requireDate(date) }),
  });
}

export function premiumDetailsRoute(month: string) {
  const normalizedMonth = requireMonth(month);
  return Object.freeze({
    pathname: "/premium-details" as const,
    params: Object.freeze({ month: normalizedMonth }),
  });
}

export function complianceDetailsRoute(month: string) {
  const normalizedMonth = requireMonth(month);
  return Object.freeze({
    pathname: "/compliance-details" as const,
    params: Object.freeze({ month: normalizedMonth }),
  });
}

export function tariffAssessmentRoute(month: string) {
  const normalizedMonth = requireMonth(month);
  return Object.freeze({
    pathname: "/tariff-assessment" as const,
    params: Object.freeze({ month: normalizedMonth }),
  });
}

export function settingsInfoRoute(section: SettingsInfoSection) {
  return Object.freeze({
    pathname: "/info-details" as const,
    params: Object.freeze({ section }),
  });
}

export function dayEditorRoute(date: string, mode: "SHIFT" | "APPOINTMENT", entryId?: string) {
  return Object.freeze({
    pathname: "/day-editor" as const,
    params: Object.freeze({
      date: requireDate(date),
      mode,
      ...(entryId ? { entryId: requireIdentifier(entryId) } : {}),
    }),
  });
}

export function calendarRoute(month: string) {
  return Object.freeze({
    pathname: "/" as const,
    params: Object.freeze({ month: requireMonth(month) }),
  });
}

export function analysisRoute(month: string) {
  return Object.freeze({
    pathname: "/analysis" as const,
    params: Object.freeze({ month: requireMonth(month) }),
  });
}

export function templateEditorRoute(id?: string, quickEntryDate?: string) {
  return Object.freeze({
    pathname: "/template-editor" as const,
    params: Object.freeze({
      ...(id ? { id: requireIdentifier(id) } : {}),
      ...(quickEntryDate ? { quickEntryDate: requireDate(quickEntryDate) } : {}),
    }),
  });
}

export function locationPickerRoute(current?: string) {
  return Object.freeze({
    pathname: "/location-picker" as const,
    params: Object.freeze(current ? { current } : {}),
  });
}

export function settingsEditorRoute(section: "WORK" | "TARIFF") {
  return Object.freeze({
    pathname: "/settings-editor" as const,
    params: Object.freeze({ section }),
  });
}
