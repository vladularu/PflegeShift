import { useEffect } from "react";

import { usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import { useFeedback } from "@/ui/feedback";

export function NotificationFeedbackBridge() {
  const { clearNotificationWarning, notificationWarning } = usePflegeShiftStatus();
  const { showFeedback } = useFeedback();

  useEffect(() => {
    if (notificationWarning === null) return;
    showFeedback({ message: notificationWarning.message, duration: 8_000 });
    clearNotificationWarning(notificationWarning.id);
  }, [clearNotificationWarning, notificationWarning, showFeedback]);

  return null;
}
