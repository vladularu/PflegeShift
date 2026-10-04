import { router, useLocalSearchParams } from "expo-router";
import { useRemunerationData } from "@/application/remuneration-provider";
import { isCurrentTvoedSueMonthConfirmation } from "@/domain/saved-tvoed-sue-month-confirmation";
import { isCurrentTvoedSueAllowanceConfirmation } from "@/domain/saved-tvoed-sue-allowance-confirmation";
import { resolveRemunerationMonth } from "@/engine/remuneration-context";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { SueMonthForm } from "./sue-month-form";

/** Only one unchanged SuE profile and one exact catalog version may be edited. */
export function SueMonthScreen() {
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
        message="Die SuE-Tarifzuordnung konnte nicht geprüft werden."
        onRetry={() => void history.reload()}
      />
    );
  }
  const context = periods.length === 1 ? periods[0].context : null;
  if (
    context?.kind !== "tvoed-sue-draft" ||
    context.profile === null ||
    context.profile.effectiveFrom === null ||
    context.source.versionId === null
  )
    return (
      <LoadFailureView
        message="Für diesen Monat liegt kein eindeutiger SuE-Tabellenentwurf vor. Bitte das Vergütungsprofil prüfen."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );

  const profile = context.profile;
  const version = context.source.versionId;
  const savedBase = history.tvoedSueMonthConfirmations.find((item) => item.month === month) ?? null;
  const savedAllowance =
    history.tvoedSueAllowanceConfirmations.find((item) => item.month === month) ?? null;
  return (
    <SueMonthForm
      key={JSON.stringify([
        month,
        profile.effectiveFrom,
        profile.revision,
        version,
        context.groupId,
        context.stepId,
        context.weeklyMinutes,
      ])}
      month={month}
      profileEffectiveFrom={context.profile.effectiveFrom}
      profileRevision={profile.revision}
      ruleVersionId={version}
      groupId={context.groupId}
      savedBase={savedBase}
      savedAllowance={savedAllowance}
      currentBase={
        savedBase !== null && isCurrentTvoedSueMonthConfirmation(savedBase, profile, version)
      }
      currentAllowance={
        savedAllowance !== null &&
        isCurrentTvoedSueAllowanceConfirmation(savedAllowance, profile, version)
      }
      disabled={history.status !== "ready"}
      onSaveBase={history.saveTvoedSueMonthConfirmation}
      onSaveAllowance={history.saveTvoedSueAllowanceConfirmation}
      onReload={() => void history.reload()}
    />
  );
}
