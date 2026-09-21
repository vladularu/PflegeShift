import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text, View } from "react-native";
import {
  DEFAULT_ANALYSIS_VIEW,
  moveAnalysisCard,
  type AnalysisViewPreferences,
} from "@/domain/analysis-view";
import { AnalysisViewProvider, useAnalysisView } from "./analysis-view-preferences";
import { AnalysisViewControls } from "./analysis-view-controls";
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context/jest/mock") as {
    default: object;
  };
  return actual.default;
});
let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: mockFontScale }),
}));
const mockDb = {};
const mockLoad = jest.fn<() => Promise<AnalysisViewPreferences>>();
const mockSave = jest.fn<(_db: unknown, p: AnalysisViewPreferences) => Promise<void>>();
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDb }));
jest.mock("@/infrastructure/database/analysis-view-repository", () => ({
  loadAnalysisView: () => mockLoad(),
  saveAnalysisView: (db: unknown, p: AnalysisViewPreferences) => mockSave(db, p),
}));
function Harness() {
  const s = useAnalysisView();
  return (
    <View>
      <Text testID="state">{JSON.stringify(s.preferences)}</Text>
      <Text>{s.ready ? "ready" : "loading"}</Text>
      <Text>{s.error ?? "OK"}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hide pay"
        onPress={() => s.update((p) => ({ ...p, hidden: ["PAY"] }))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Move shifts"
        onPress={() => s.update((p) => moveAnalysisCard(p, "SHIFTS", -1))}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={s.retry} />
    </View>
  );
}
const read = (screen: Awaited<ReturnType<typeof render>>) =>
  JSON.parse(screen.getByTestId("state").props.children) as AnalysisViewPreferences;
describe("analysis view preferences", () => {
  beforeEach(() => {
    mockFontScale = 1;
    mockLoad.mockReset().mockResolvedValue(DEFAULT_ANALYSIS_VIEW);
    mockSave.mockReset().mockResolvedValue();
  });
  it("loads the stored order and visibility after remount", async () => {
    let stored = DEFAULT_ANALYSIS_VIEW;
    mockLoad.mockImplementation(async () => stored);
    mockSave.mockImplementation(async (_db, next) => {
      stored = next;
    });
    const screen = await render(
      <AnalysisViewProvider>
        <Harness />
      </AnalysisViewProvider>,
    );
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Hide pay" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move shifts" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    await screen.unmount();
    const next = await render(
      <AnalysisViewProvider>
        <Harness />
      </AnalysisViewProvider>,
    );
    await waitFor(() => expect(read(next).hidden).toEqual(["PAY"]));
    expect(read(next).order).toEqual(["WORK", "CHECK", "SHIFTS", "PAY"]);
  });
  it("serializes rapid writes and preserves every newer change", async () => {
    let finish!: () => void;
    mockSave.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const screen = await render(
      <AnalysisViewProvider>
        <Harness />
      </AnalysisViewProvider>,
    );
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Hide pay" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move shifts" }));
    expect(mockSave).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    expect(mockSave.mock.calls[1][1]).toMatchObject({
      hidden: ["PAY"],
      order: ["WORK", "CHECK", "SHIFTS", "PAY"],
    });
  });
  it("rolls back a failed write and retries the requested view", async () => {
    mockSave.mockRejectedValueOnce(new Error("disk full"));
    const screen = await render(
      <AnalysisViewProvider>
        <Harness />
      </AnalysisViewProvider>,
    );
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Hide pay" }));
    await waitFor(() =>
      expect(screen.getByText("Deine Ansicht konnte nicht gespeichert werden.")).toBeTruthy(),
    );
    expect(read(screen)).toEqual(DEFAULT_ANALYSIS_VIEW);
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    expect(read(screen).hidden).toEqual(["PAY"]);
  });
  it("does not replace saved preferences after a load failure", async () => {
    mockLoad.mockRejectedValueOnce(new Error("locked"));
    const screen = await render(
      <AnalysisViewProvider>
        <Harness />
      </AnalysisViewProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Deine Ansicht konnte nicht geladen werden.")).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Hide pay" }));
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
  });
  it.each([1, 3.1])("supports native customization at scale %s", async (fontScale) => {
    mockFontScale = fontScale;
    const screen = await render(
      <AnalysisViewProvider>
        <Harness />
        <AnalysisViewControls />
      </AnalysisViewProvider>,
    );
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Ansicht anpassen" }));
    expect(screen.getByTestId("analysis-setting-WORK")).toHaveStyle({
      flexDirection: fontScale >= 1.3 ? "column" : "row",
    });
    expect(screen.getByLabelText("Gehalt anzeigen").props.hitSlop).toBe(8);
    await fireEvent(screen.getByLabelText("Gehalt anzeigen"), "valueChange", false);
    expect(screen.queryByRole("button", { name: "Schichten nach oben" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Reihenfolge ändern" }));
    expect(screen.queryByLabelText("Gehalt anzeigen")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Schichten nach oben" }));
    expect(read(screen)).toMatchObject({
      hidden: ["PAY"],
      order: ["WORK", "CHECK", "SHIFTS", "PAY"],
    });
    await fireEvent.press(screen.getByRole("button", { name: "Standard wiederherstellen" }));
    expect(read(screen)).toEqual(DEFAULT_ANALYSIS_VIEW);
    await fireEvent.press(screen.getByRole("button", { name: "Fertig" }));
    expect(screen.queryByText("Deine Karten für Monat und Jahr.")).toBeNull();
  });
});
