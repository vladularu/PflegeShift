import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftStatus,
  usePflegeShiftTemplates,
} from "@/application/pflegeshift-provider";
import {
  buildQuickEntryActions,
  type QuickEntryStampAction,
} from "@/features/calendar/quick-entry-actions";
import { completeShiftSelectionNavigation } from "@/features/calendar/quick-entry-navigation";
import {
  ShiftSelectionErrorNotice,
  ShiftSelectionPanel,
} from "@/features/calendar/shift-selection-panel";
import { useQuickStampAction } from "@/features/calendar/use-quick-stamp-action";
import { templateEditorRoute } from "@/navigation/routes";
import { parseLocalDateRouteParam, type RouteParam } from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { useThemeStatusBar } from "@/ui/use-theme-status-bar";

export function ShiftSelectionScreen() {
  useThemeStatusBar();
  const params = useLocalSearchParams<{ date?: RouteParam }>();
  const parsedDate = parseLocalDateRouteParam(params.date);
  const { ready, error, reload } = usePflegeShiftStatus();
  const { templates } = usePflegeShiftTemplates();
  const { entries, removeEntry, upsertShift } = usePflegeShiftEntries();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const actions = useMemo(() => buildQuickEntryActions(templates), [templates]);
  const saveStampAction = useQuickStampAction({
    entries,
    removeEntry,
    upsertShift,
    onBusyChange: setBusy,
    onError: (message) => setSaveError(message || null),
  });

  if (parsedDate.status === "invalid" || parsedDate.status === "missing") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der ausgewählte Kalendertag ist ungültig."
        onRetry={() => router.back()}
        title="Schichtauswahl kann nicht geöffnet werden"
      />
    );
  }
  if (!ready) return <LoadingView />;
  if (error) return <LoadFailureView message={error} onRetry={() => void reload()} />;

  const date = parsedDate.value;

  async function selectAction(action: QuickEntryStampAction, selectedDate: string) {
    const saved = await saveStampAction(action, selectedDate);
    if (saved) {
      completeShiftSelectionNavigation();
      router.back();
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ShiftSelectionPanel
        actions={actions}
        animateEntry={false}
        busy={busy}
        date={date}
        onAddTemplate={() => router.push(templateEditorRoute(undefined, date))}
        onClose={() => router.back()}
        onEditTemplate={(templateId) => router.push(templateEditorRoute(templateId, date))}
        onSelectAction={(action, selectedDate) => void selectAction(action, selectedDate)}
      />
      {saveError ? <ShiftSelectionErrorNotice message={saveError} /> : null}
    </View>
  );
}
