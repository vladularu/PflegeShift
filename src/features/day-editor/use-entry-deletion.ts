import { useCallback } from "react";

import { usePflegeShiftEntries } from "@/application/pflegeshift-provider";
import type { CalendarEntry } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { deletionFeedback } from "@/ui/haptics";

export function useEntryDeletion({
  onDeleted,
  onError,
}: {
  readonly onDeleted: () => void;
  readonly onError: (message: string) => void;
}) {
  const { removeEntry } = usePflegeShiftEntries();

  return useCallback(
    (entry: CalendarEntry) => {
      confirmDestructiveAction({
        title: "Eintrag löschen?",
        message: `„${entry.title}“ wird aus dem Kalender entfernt.`,
        onConfirm: () =>
          void removeEntry(entry)
            .then(() => {
              deletionFeedback();
              onDeleted();
            })
            .catch((reason: unknown) =>
              onError(userFacingErrorMessage(reason, "Löschen fehlgeschlagen.")),
            ),
      });
    },
    [onDeleted, onError, removeEntry],
  );
}
