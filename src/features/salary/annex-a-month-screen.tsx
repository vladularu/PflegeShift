import { router, useLocalSearchParams } from "expo-router";
import { useRemunerationData } from "@/application/remuneration-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { isCurrentTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import { resolveRemunerationMonth } from "@/engine/remuneration-context";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { AnnexAMonthForm } from "./annex-a-month-form";

/** Confirmation is only editable for one unchanged draft profile and rule version. */
export function AnnexAMonthScreen() {
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
  if (history.status !== "ready" && history.profiles.length === 0) return <LoadingView />;

  const month = parsed.value;
  let periods: ReturnType<typeof resolveRemunerationMonth>;
  try {
    periods = resolveRemunerationMonth(month, history.profiles, resolver);
  } catch {
    return (
      <LoadFailureView
        message="Die TVöD-Tarifzuordnung konnte nicht geprüft werden."
        onRetry={() => void history.reload()}
      />
    );
  }
  const context = periods.length === 1 ? periods[0].context : null;
  if (
    context?.kind !== "tvoed-annex-a-draft" ||
    context.profile === null ||
    context.profile.effectiveFrom === null ||
    context.source.versionId === null
  )
    return (
      <LoadFailureView
        message="Für diesen Monat liegt kein eindeutiger TVöD-Anlage-A-Entwurf vor. Bitte das Vergütungsprofil prüfen."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );

  const profile = context.profile;
  const version = context.source.versionId;
  const saved = history.tvoedAnnexAMonthConfirmations.find((item) => item.month === month) ?? null;
  return (
    <AnnexAMonthForm
      key={JSON.stringify([
        month,
        profile.effectiveFrom,
        profile.revision,
        version,
        context.variant,
        context.groupId,
        context.stepId,
        context.weeklyMinutes,
        context.fullTimeWeeklyMinutes,
      ])}
      month={month}
      profileEffectiveFrom={context.profile.effectiveFrom}
      profileRevision={profile.revision}
      ruleVersionId={version}
      saved={saved}
      current={saved !== null && isCurrentTvoedAnnexAMonthConfirmation(saved, profile, version)}
      disabled={history.status !== "ready"}
      onSave={history.saveTvoedAnnexAMonthConfirmation}
      onReload={() => void history.reload()}
    />
  );
}
