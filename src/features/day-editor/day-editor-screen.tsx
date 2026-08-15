import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import { usePflegeShiftEntries, usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import { today } from "@/engine/calendar";
import { DayEditorForm } from "@/features/day-editor/day-editor-form";
import { resolveEditorSession, resolveEditorTarget } from "@/features/editor-session";
import {
  parseEnumRouteParam,
  parseIdentifierRouteParam,
  parseLocalDateRouteParam,
  type RouteParam,
} from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";

export function DayEditorScreen() {
  const params = useLocalSearchParams<{
    date?: RouteParam;
    mode?: RouteParam;
    entryId?: RouteParam;
  }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const parsedDate = parseLocalDateRouteParam(params.date);
  const parsedMode = parseEnumRouteParam(params.mode, ["SHIFT", "APPOINTMENT"] as const);
  const parsedEntryId = parseIdentifierRouteParam(params.entryId);
  const routeInvalid =
    parsedDate.status !== "valid" ||
    parsedMode.status !== "valid" ||
    parsedEntryId.status === "invalid";
  const date = parsedDate.status === "valid" ? parsedDate.value : today();
  const entryId = parsedEntryId.status === "valid" ? parsedEntryId.value : undefined;
  const existing = useMemo(
    () => entries.find((entry) => entry.id === entryId && entry.deletedAt === null) ?? null,
    [entries, entryId],
  );
  const requestedMode = parsedMode.status === "valid" ? parsedMode.value : "SHIFT";

  if (routeInvalid) {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zum Eintrag enthält ungültige Parameter."
        onRetry={() => router.back()}
        title="Eintrag kann nicht geöffnet werden"
      />
    );
  }
  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;

  const target = resolveEditorTarget(entryId, existing);
  if (ready && target.kind === "MISSING") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der angeforderte Kalendereintrag existiert nicht mehr."
        onRetry={() => router.back()}
        title="Eintrag nicht verfügbar"
      />
    );
  }
  const session = resolveEditorSession(ready, `${date}:${entryId ?? "new"}:${requestedMode}`, () =>
    target.kind === "EDIT" ? target.value : null,
  );
  if (session === null) return <LoadingView />;
  return (
    <DayEditorForm
      key={session.key}
      date={date}
      existing={session.initialValue}
      requestedMode={requestedMode}
      sessionKey={session.key}
    />
  );
}
