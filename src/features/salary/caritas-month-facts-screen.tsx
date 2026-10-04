import { router, useLocalSearchParams } from "expo-router";
import { useRemunerationData } from "@/application/remuneration-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import {
  isCurrentCaritasMonthFacts,
  validateSavedCaritasMonthFacts,
} from "@/domain/saved-caritas-month-facts";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { CaritasMonthFactsForm } from "./caritas-month-facts-form";
import { caritasMonthFactsContext } from "./caritas-month-facts-context";

export function CaritasMonthFactsScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const parsed = parseMonthRouteParam(params.month);
  const history = useRemunerationData();
  const { resolver } = useRuleCatalogRuntime();
  if (parsed.status !== "valid")
    return (
      <LoadFailureView
        message="Der Link enthält keinen gültigen Monat."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  if (history.status === "error")
    return (
      <LoadFailureView
        message={history.error ?? "Vergütungsdaten nicht verfügbar."}
        onRetry={() => void history.reload()}
      />
    );
  if (history.status !== "ready") return <LoadingView />;
  const context = caritasMonthFactsContext(parsed.value, history.profiles, resolver);
  if (context === null)
    return (
      <LoadFailureView
        message="Für diesen Monat liegt kein eindeutiger Caritas-Pflege-Entwurf mit passendem Regelstand vor. Bitte das Vergütungsprofil prüfen."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  let saved = null;
  try {
    const matching = history.caritasMonthFacts.filter((item) => item.month === parsed.value);
    if (matching.length > 1) throw new Error("ambiguous month facts");
    saved = matching.length === 1 ? validateSavedCaritasMonthFacts(matching[0]) : null;
  } catch {
    return (
      <LoadFailureView
        message="Die gespeicherten Caritas-Monatsangaben konnten nicht eindeutig geprüft werden."
        onRetry={() => void history.reload()}
      />
    );
  }
  return (
    <CaritasMonthFactsForm
      key={JSON.stringify([context.bindingKey, saved])}
      month={parsed.value}
      profileEffectiveFrom={context.profileEffectiveFrom}
      profileRevision={context.profile.revision}
      ruleVersionId={context.ruleVersionId}
      saved={saved}
      current={
        saved !== null &&
        isCurrentCaritasMonthFacts(saved, context.profile, context.packageId, context.ruleVersionId)
      }
      onSave={history.saveCaritasMonthFacts}
      onReload={() => void history.reload()}
    />
  );
}
