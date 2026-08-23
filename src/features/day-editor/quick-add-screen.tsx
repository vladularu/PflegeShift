import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftStatus,
  usePflegeShiftTemplates,
} from "@/application/pflegeshift-provider";
import { userFacingErrorMessage } from "@/domain/errors";
import { today } from "@/engine/calendar";
import {
  buildQuickEntryActions,
  type QuickEntryStampAction,
} from "@/features/calendar/quick-entry-actions";
import {
  ShiftSelectionErrorNotice,
  ShiftSelectionPanel,
} from "@/features/calendar/shift-selection-panel";
import { parseLocalDateRouteParam, type RouteParam } from "@/navigation/route-params";
import { templateEditorRoute } from "@/navigation/routes";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { successFeedback, warningFeedback } from "@/ui/haptics";
import { useThemeStatusBar } from "@/ui/use-theme-status-bar";

export function QuickAddScreen() {
  useThemeStatusBar();
  const params = useLocalSearchParams<{ date?: RouteParam }>();
  const { templates } = usePflegeShiftTemplates();
  const { upsertShift } = usePflegeShiftEntries();
  const { error: loadError, ready, reload } = usePflegeShiftStatus();
  const parsedDate = parseLocalDateRouteParam(params.date);
  const date = parsedDate.status === "valid" ? parsedDate.value : today();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const actions = useMemo(() => buildQuickEntryActions(templates), [templates]);

  if (parsedDate.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Schnellauswahl enthält kein gültiges Datum."
        onRetry={() => router.back()}
        title="Schnellauswahl kann nicht geöffnet werden"
      />
    );
  }
  if (ready && loadError) {
    return <LoadFailureView message={loadError} onRetry={() => void reload()} />;
  }
  if (!ready) return <LoadingView />;

  async function saveTemplate(action: QuickEntryStampAction, selectedDate: string) {
    const { template } = action;
    try {
      setSaving(true);
      setError(null);
      await upsertShift({
        date: selectedDate,
        templateId: template.id,
        title: template.name,
        type: template.type,
        allDay: template.allDay,
        startTime: template.startTime,
        endTime: template.endTime,
        breakMinutes: template.breakMinutes,
        color: template.color,
        symbol: template.symbol,
        notification: template.notification,
        location: template.location,
      });
      successFeedback();
      router.back();
    } catch (saveError) {
      warningFeedback();
      setError(userFacingErrorMessage(saveError, "Vorlage konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ShiftSelectionPanel
        actions={actions}
        animateEntry={false}
        busy={saving}
        date={date}
        onAddTemplate={() => router.push(templateEditorRoute())}
        onClose={() => router.back()}
        onEditTemplate={(templateId) => router.push(templateEditorRoute(templateId))}
        onSelectAction={(action, selectedDate) => void saveTemplate(action, selectedDate)}
      />
      {error ? <ShiftSelectionErrorNotice message={error} /> : null}
    </View>
  );
}
