import { AccessibilityInfo } from "react-native";
import { useCallback, useRef } from "react";

import type { CalendarEntry, SaveShiftInput, ShiftEntry } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import {
  matchingQuickEntries,
  saveQuickEntryAction,
  type QuickEntryStampAction,
} from "@/features/calendar/quick-entry-actions";
import { announceStampResult } from "@/features/calendar/stamp-accessibility";
import { selectionFeedback } from "@/ui/haptics";

export function useQuickStampAction({
  entries,
  removeEntry,
  upsertShift,
  onBusyChange,
  onError,
}: {
  readonly entries: readonly CalendarEntry[];
  readonly removeEntry: (entry: CalendarEntry) => Promise<void>;
  readonly upsertShift: (input: SaveShiftInput) => Promise<ShiftEntry>;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onError: (message: string) => void;
}) {
  const savingDates = useRef(new Set<string>());

  return useCallback(
    async (action: QuickEntryStampAction, date: string) => {
      if (savingDates.current.has(date)) return false;
      savingDates.current.add(date);
      onBusyChange(true);
      onError("");
      try {
        const matches = matchingQuickEntries(action, date, entries);
        if (matches.length > 0) {
          for (const entry of matches) await removeEntry(entry);
          announceStampResult(
            AccessibilityInfo.announceForAccessibility,
            action.label,
            date,
            matches.length,
          );
          selectionFeedback();
        } else {
          await saveQuickEntryAction(action, date, upsertShift);
          announceStampResult(AccessibilityInfo.announceForAccessibility, action.label, date, 0);
          selectionFeedback();
        }
        return true;
      } catch (saveError) {
        selectionFeedback();
        onError(userFacingErrorMessage(saveError, "Eintrag konnte nicht geändert werden."));
        return false;
      } finally {
        savingDates.current.delete(date);
        onBusyChange(savingDates.current.size > 0);
      }
    },
    [entries, onBusyChange, onError, removeEntry, upsertShift],
  );
}
