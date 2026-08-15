import { router } from "expo-router";
import { useCallback, type Dispatch, type SetStateAction } from "react";

import { beginShiftSelectionNavigation } from "@/features/calendar/quick-entry-navigation";
import type { QuickEntryStampAction } from "@/features/calendar/quick-entry-actions";
import { shiftSelectionRoute } from "@/navigation/routes";

export function useOpenShiftSelection({
  setPlannerMode,
  setStampTool,
}: {
  readonly setPlannerMode: Dispatch<SetStateAction<boolean>>;
  readonly setStampTool: Dispatch<SetStateAction<QuickEntryStampAction | null>>;
}) {
  return useCallback(
    (date: string) => {
      beginShiftSelectionNavigation();
      setPlannerMode(false);
      setStampTool(null);
      router.push(shiftSelectionRoute(date) as never);
    },
    [setPlannerMode, setStampTool],
  );
}
