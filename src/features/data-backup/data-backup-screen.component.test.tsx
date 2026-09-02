import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { DataBackupScreen } from "@/features/data-backup/data-backup-screen";
import { LocalBackupSelectionError } from "@/features/data-backup/local-backup-restore-errors";
import type { LocalBackupRestoreCandidate } from "@/features/data-backup/local-backup-restore-flow";

const mockCreateAndShare = jest.fn<() => Promise<"dismissed" | "shared">>();
const mockSelectBackup = jest.fn<() => Promise<"canceled" | "selected">>();
const mockRestoreSelected = jest.fn<() => Promise<void>>();
const mockShowFeedback = jest.fn();
let mockCandidate: LocalBackupRestoreCandidate | null = null;

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

jest.mock("@/features/data-backup/use-local-backup-export", () => ({
  useLocalBackupExport: () => ({ busy: false, createAndShare: mockCreateAndShare }),
}));

jest.mock("@/features/data-backup/use-local-backup-restore", () => ({
  useLocalBackupRestore: () => ({
    busy: false,
    candidate: mockCandidate,
    selectBackup: mockSelectBackup,
    restoreSelected: mockRestoreSelected,
  }),
}));

jest.mock("@/ui/feedback", () => ({
  useFeedback: () => ({ showFeedback: mockShowFeedback }),
}));

describe("DataBackupScreen", () => {
  beforeEach(() => {
    mockCreateAndShare.mockReset();
    mockSelectBackup.mockReset();
    mockRestoreSelected.mockReset();
    mockShowFeedback.mockReset();
    mockCandidate = null;
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  it("explains the plaintext export before opening the share sheet", async () => {
    const screen = await render(<DataBackupScreen />);

    expect(screen.getByText("Enthalten")).toBeTruthy();
    expect(screen.getByText(/außerhalb der App nicht verschlüsselt/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Backup erstellen und teilen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Backup-Datei auswählen" })).toBeTruthy();
  });

  it("shows a validated backup preview before enabling replacement", async () => {
    mockCandidate = {
      fileName: "LUNA-Shift-Backup-2026-09-02.json",
      backup: {} as LocalBackupRestoreCandidate["backup"],
      preview: {
        createdAt: "2026-09-02T12:00:00.000Z",
        appVersion: "0.1.0",
        databaseSchemaVersion: 12,
        profileIncluded: true,
        templateCount: 7,
        shiftCount: 1,
        appointmentCount: 2,
        monthlyTariffDecisionCount: 1,
        preferenceCount: 4,
        deletedRecordCount: 1,
        firstEntryDate: "2026-09-02",
        lastEntryDate: "2026-10-03",
      },
    };
    const screen = await render(<DataBackupScreen />);

    expect(screen.getByText(mockCandidate.fileName)).toBeTruthy();
    expect(screen.getByText("1 Dienst · 2 Termine")).toBeTruthy();
    expect(screen.getByText("Zeitraum: 02.09.2026 – 03.10.2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aktuelle Daten ersetzen" })).toBeTruthy();
  });

  it("opens the destructive confirmation before restoring a validated backup", async () => {
    mockCandidate = {
      fileName: "backup.json",
      backup: {} as LocalBackupRestoreCandidate["backup"],
      preview: {
        createdAt: "2026-09-02T12:00:00.000Z",
        appVersion: null,
        databaseSchemaVersion: 12,
        profileIncluded: true,
        templateCount: 7,
        shiftCount: 1,
        appointmentCount: 0,
        monthlyTariffDecisionCount: 0,
        preferenceCount: 0,
        deletedRecordCount: 0,
        firstEntryDate: "2026-09-02",
        lastEntryDate: "2026-09-02",
      },
    };
    mockRestoreSelected.mockResolvedValue(undefined);
    const screen = await render(<DataBackupScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Aktuelle Daten ersetzen" }));

    expect(mockRestoreSelected).not.toHaveBeenCalled();
    const alertCall = jest.mocked(Alert.alert).mock.calls.at(-1);
    expect(alertCall?.[0]).toBe("Aktuelle Daten ersetzen?");
    expect(alertCall?.[1]).toContain("lässt sich nicht rückgängig machen");
    const buttons = alertCall?.[2];
    expect(buttons?.[1]).toMatchObject({ text: "Daten ersetzen", style: "destructive" });
    buttons?.[1]?.onPress?.();
    await waitFor(() => expect(mockRestoreSelected).toHaveBeenCalledTimes(1));
  });

  it("rejects an invalid selected file without exposing technical details", async () => {
    mockSelectBackup.mockRejectedValue(
      new LocalBackupSelectionError("Der Prüfwert des Backups stimmt nicht."),
    );
    const screen = await render(<DataBackupScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Backup-Datei auswählen" }));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Backup nicht verwendbar",
        "Der Prüfwert des Backups stimmt nicht.",
      ),
    );
    expect(mockRestoreSelected).not.toHaveBeenCalled();
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
