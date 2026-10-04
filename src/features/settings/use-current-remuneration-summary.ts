import { Temporal } from "@js-temporal/polyfill";
import { useRemunerationHistory } from "@/application/remuneration-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import type { UserProfile } from "@/domain/types";
import { datedSalarySummary } from "./work-profile-summary";

export function useCurrentRemunerationSummary(profile: UserProfile) {
  const history = useRemunerationHistory();
  const { resolver } = useRuleCatalogRuntime();
  if (history.status !== "ready")
    return {
      label:
        history.status === "loading"
          ? "Vergütung wird geladen …"
          : "Vergütungsstand nicht verfügbar",
      tariff: false,
    };
  return datedSalarySummary(
    history.profiles,
    Temporal.Now.plainDateISO(profile.timeZone).toString(),
    resolver,
  );
}
