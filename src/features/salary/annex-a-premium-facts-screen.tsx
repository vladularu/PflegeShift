import { router, useLocalSearchParams } from "expo-router";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { isCurrentTvoedAnnexAPremiumFacts } from "@/domain/saved-tvoed-annex-a-premium-facts";
import { resolveHolidayMapForMonth } from "@/engine/holidays";
import { resolveRemunerationMonth } from "@/engine/remuneration-context";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { AnnexAPremiumFactsForm } from "./annex-a-premium-facts-form";
import { annexAPremiumDayChoices } from "./annex-a-premium-facts-model";

export function AnnexAPremiumFactsScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const parsed = parseMonthRouteParam(params.month);
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const { profile: workProfile } = usePflegeShiftProfile();
  const { resolver } = useRuleCatalogRuntime();
  if (parsed.status !== "valid")
    return (
      <LoadFailureView
        message="Der Link enthält keinen gültigen Monat."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  if (root.error || history.status === "error")
    return (
      <LoadFailureView
        message={root.error ?? history.error ?? "Vergütungsdaten nicht verfügbar."}
        onRetry={() => {
          void root.reload();
          void history.reload();
        }}
      />
    );
  if (!root.ready || history.status !== "ready") return <LoadingView />;
  if (!workProfile || workProfile.timeZone !== "Europe/Berlin")
    return (
      <LoadFailureView
        message="Für die Zuschlagsangaben ist ein Arbeitszeitmodell mit Zeitzone Europe/Berlin nötig."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );

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
  const effectiveFrom = profile.effectiveFrom;
  if (effectiveFrom === null)
    return (
      <LoadFailureView
        message="Das TVöD-Profil hat keinen gültigen Beginn."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  const choices = annexAPremiumDayChoices(month, entries, profile, workProfile.timeZone);
  const saved = history.tvoedAnnexAPremiumFacts.find((item) => item.month === month) ?? null;
  let holidays: ReadonlyMap<string, unknown> | null = null;
  try {
    const result = resolveHolidayMapForMonth(
      month,
      workProfile.federalState,
      resolver,
      workProfile.holidayRegion,
    );
    if (result.status === "AVAILABLE") holidays = result.holidays;
  } catch {
    // No holiday inference when the catalog or work location is incomplete.
  }
  return (
    <AnnexAPremiumFactsForm
      key={JSON.stringify([month, profile.effectiveFrom, profile.revision, version])}
      month={month}
      profileEffectiveFrom={effectiveFrom}
      profileRevision={profile.revision}
      ruleVersionId={version}
      choices={choices}
      holidays={holidays}
      saved={saved}
      current={saved !== null && isCurrentTvoedAnnexAPremiumFacts(saved, profile, version)}
      onSave={history.saveTvoedAnnexAPremiumFacts}
      onReload={() => {
        void root.reload();
        void history.reload();
      }}
    />
  );
}
