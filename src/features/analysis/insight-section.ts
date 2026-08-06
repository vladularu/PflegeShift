export type InsightSection = "TIME" | "PAY";

export function insightSectionFromRoute(value: string | string[] | undefined): InsightSection {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "salary" || candidate === "pay" ? "PAY" : "TIME";
}
