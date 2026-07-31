import { requireLocalDate } from "@/domain/validation";

export const TAB_ROUTES = Object.freeze([
  { key: "calendar", route: "/" },
  { key: "analysis", route: "/analysis" },
  { key: "salary", route: "/salary" },
  { key: "more", route: "/more" },
] as const);

export function dayDetailsRoute(date: string) {
  return Object.freeze({
    pathname: "/day-details" as const,
    params: Object.freeze({ date: requireLocalDate(date) }),
  });
}

export function quickAddRoute(date: string) {
  return Object.freeze({
    pathname: "/quick-add" as const,
    params: Object.freeze({ date: requireLocalDate(date) }),
  });
}

export function premiumDetailsRoute(month: string) {
  const normalizedMonth = requireLocalDate(`${month}-01`).slice(0, 7);
  return Object.freeze({
    pathname: "/premium-details" as const,
    params: Object.freeze({ month: normalizedMonth }),
  });
}

export function tariffAssessmentRoute(month: string) {
  const normalizedMonth = requireLocalDate(`${month}-01`).slice(0, 7);
  return Object.freeze({
    pathname: "/tariff-assessment" as const,
    params: Object.freeze({ month: normalizedMonth }),
  });
}

export function dayEditorRoute(
  date: string,
  mode: "SHIFT" | "APPOINTMENT",
  entryId?: string,
) {
  return Object.freeze({
    pathname: "/day-editor" as const,
    params: Object.freeze({
      date: requireLocalDate(date),
      mode,
      ...(entryId ? { entryId } : {}),
    }),
  });
}
