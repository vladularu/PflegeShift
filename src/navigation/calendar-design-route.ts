export function calendarDesignRoute(origin: "calendar" | "settings", notice?: string | string[]) {
  return {
    pathname: "/calendar-design" as const,
    params: { origin, ...(notice === "holidays" || notice === "loading" ? { notice } : {}) },
  };
}
