import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { DataBackupScreen } from "@/features/data-backup/data-backup-screen";

const mockCreateAndShare = jest.fn<() => Promise<"dismissed" | "shared">>();
const mockShowFeedback = jest.fn();

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

jest.mock("@/features/data-backup/use-local-backup-export", () => ({
  useLocalBackupExport: () => ({ busy: false, createAndShare: mockCreateAndShare }),
}));

jest.mock("@/ui/feedback", () => ({
  useFeedback: () => ({ showFeedback: mockShowFeedback }),
}));

describe("DataBackupScreen", () => {
  beforeEach(() => {
    mockCreateAndShare.mockReset();
    mockShowFeedback.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  it("explains the plaintext export before opening the share sheet", async () => {
    const screen = await render(<DataBackupScreen />);

    expect(screen.getByText("Enthalten")).toBeTruthy();
    expect(screen.getByText(/außerhalb der App nicht verschlüsselt/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Backup erstellen und teilen" })).toBeTruthy();
  });

  it("reports a handed-off backup but not a dismissed share sheet", async () => {
    mockCreateAndShare.mockResolvedValueOnce("shared");
    const screen = await render(<DataBackupScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Backup erstellen und teilen" }));
    await waitFor(() =>
      expect(mockShowFeedback).toHaveBeenCalledWith({
        message: "Backup wurde an iOS übergeben.",
      }),
    );

    mockCreateAndShare.mockResolvedValueOnce("dismissed");
    fireEvent.press(screen.getByRole("button", { name: "Backup erstellen und teilen" }));
    await waitFor(() => expect(mockCreateAndShare).toHaveBeenCalledTimes(2));
    expect(mockShowFeedback).toHaveBeenCalledTimes(1);
  });

  it("keeps failures explicit without claiming that data changed", async () => {
    mockCreateAndShare.mockRejectedValueOnce(new Error("native failure"));
    const screen = await render(<DataBackupScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Backup erstellen und teilen" }));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Backup fehlgeschlagen",
        expect.stringContaining("Deine Daten wurden nicht verändert"),
      ),
    );
  });
});
