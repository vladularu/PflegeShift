import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { CheckSettingsScreen } from "./check-settings-screen";

const mockDb = {};
const mockLoad = jest.fn<() => Promise<boolean>>();
const mockSave = jest.fn<(db: unknown, value: boolean) => Promise<void>>();
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDb }));
jest.mock("@/infrastructure/database/preferences-repository", () => ({
  loadPlanningHintsPreference: () => mockLoad(),
  savePlanningHintsPreference: (db: unknown, value: boolean) => mockSave(db, value),
}));
beforeEach(() => {
  mockLoad.mockReset().mockResolvedValue(true);
  mockSave.mockReset().mockResolvedValue();
});

it("loads the saved choice and explains that report filtering is not enabled yet", async () => {
  mockLoad.mockResolvedValue(false);
  const screen = await render(<CheckSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise").props.value).toBe(false));
  expect(screen.getByText(/Bis dahin bleiben alle bisherigen Hinweise sichtbar/)).toBeTruthy();
  expect(mockSave).not.toHaveBeenCalled();
});

it("saves the choice and prevents overlapping writes", async () => {
  let resolve!: () => void;
  mockSave.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const screen = await render(<CheckSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise")).toBeTruthy());
  await fireEvent(screen.getByLabelText("Planungshinweise"), "valueChange", false);
  expect(screen.getByLabelText("Planungshinweise").props.disabled).toBe(true);
  expect(mockSave).toHaveBeenCalledWith(mockDb, false);
  await act(async () => resolve());
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise").props.value).toBe(false));
});

it("keeps the previous choice on write failure and permits retry", async () => {
  mockSave.mockRejectedValueOnce(new Error("write failed"));
  const screen = await render(<CheckSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise")).toBeTruthy());
  await fireEvent(screen.getByLabelText("Planungshinweise"), "valueChange", false);
  await waitFor(() => expect(screen.getByText(/Nicht gespeichert/)).toBeTruthy());
  expect(screen.getByLabelText("Planungshinweise").props.value).toBe(true);
  await fireEvent(screen.getByLabelText("Planungshinweise"), "valueChange", false);
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise").props.value).toBe(false));
});

it("shows a load error without writing defaults and can reload", async () => {
  mockLoad.mockRejectedValueOnce(new Error("read failed"));
  const screen = await render(<CheckSettingsScreen />);
  await waitFor(() =>
    expect(screen.getByText("Prüfungseinstellungen konnten nicht geladen werden.")).toBeTruthy(),
  );
  expect(mockSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Erneut versuchen"));
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise")).toBeTruthy());
});
