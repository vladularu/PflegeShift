import { render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NotificationFeedbackBridge } from "@/features/notifications/notification-feedback-bridge";
import { FeedbackProvider } from "@/ui/feedback";

const mockClearNotificationWarning = jest.fn();
const mockNotificationWarning = {
  id: 7,
  message: "Gespeichert. Erinnerung konnte nicht eingerichtet werden.",
} as const;

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftStatus: () => ({
    clearNotificationWarning: mockClearNotificationWarning,
    notificationWarning: mockNotificationWarning,
  }),
}));

describe("NotificationFeedbackBridge", () => {
  it("shows and consumes a non-blocking notification warning", async () => {
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 430, height: 932 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}
      >
        <FeedbackProvider>
          <NotificationFeedbackBridge />
        </FeedbackProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Gespeichert. Erinnerung konnte nicht eingerichtet werden."),
      ).toBeTruthy(),
    );
    expect(mockClearNotificationWarning).toHaveBeenCalledWith(7);
  });
});
