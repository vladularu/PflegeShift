import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Appearance, Pressable, Text, View } from "react-native";
import type { AppearancePreferences } from "@/domain/appearance";
import { AppearancePreferencesProvider, useAppearancePreferences } from "./appearance-preferences";
import { usePalette, useInversePalette } from "@/theme/palette";
import { resolvePalette } from "@/theme/theme-catalog";

let mockSystemScheme = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockSystemScheme,
}));
const mockDatabase = {};
const mockLoad = jest.fn<() => Promise<AppearancePreferences>>();
const mockSave = jest.fn<(_db: unknown, value: AppearancePreferences) => Promise<void>>();
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("@/infrastructure/database/appearance-repository", () => ({
  loadAppearancePreferences: () => mockLoad(),
  saveAppearancePreferences: (db: unknown, value: AppearancePreferences) => mockSave(db, value),
}));
function Harness() {
  const prefs = useAppearancePreferences();
  const palette = usePalette();
  const inverse = useInversePalette();
  return (
    <View>
      <Text testID="state">
        {JSON.stringify({ themeId: prefs.themeId, mode: prefs.mode, ready: prefs.ready })}
      </Text>
      <Text testID="color" style={{ color: palette.text, backgroundColor: palette.background }}>
        Theme
      </Text>
      <Text testID="inverse" style={{ backgroundColor: inverse.background }}>
        Inverse
      </Text>
      <Text>{prefs.error ?? "OK"}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Minzbrise"
        onPress={() => prefs.setTheme("mint")}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dunkel"
        onPress={() => prefs.setMode("dark")}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="System"
        onPress={() => prefs.setMode("system")}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Erneut" onPress={prefs.retry} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zurücksetzen"
        onPress={prefs.reset}
      />
    </View>
  );
}
describe("appearance preferences", () => {
  beforeEach(() => {
    mockSystemScheme = "light";
    mockLoad.mockReset().mockResolvedValue({ themeId: "standard", mode: "system" });
    mockSave.mockReset().mockResolvedValue();
    jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
  });
  it("loads saved mode/theme and uses the same theme for inverse surfaces", async () => {
    mockLoad.mockResolvedValue({ themeId: "sea", mode: "dark" });
    const screen = await render(
      <AppearancePreferencesProvider>
        <Harness />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("color")).toHaveStyle({
        backgroundColor: resolvePalette("sea", true).background,
      }),
    );
    expect(screen.getByTestId("inverse")).toHaveStyle({
      backgroundColor: resolvePalette("sea", false).background,
    });
    expect(Appearance.setColorScheme).toHaveBeenCalledWith("dark");
    await fireEvent.press(screen.getByRole("button", { name: "Zurücksetzen" }));
    await waitFor(() =>
      expect(mockSave).toHaveBeenLastCalledWith(expect.anything(), {
        themeId: "standard",
        mode: "system",
      }),
    );

    await fireEvent.press(screen.getByRole("button", { name: "System" }));
    await waitFor(() => expect(Appearance.setColorScheme).toHaveBeenCalledWith("unspecified"));
  });
  it("follows system changes and retains a chosen mode and theme after remount", async () => {
    const screen = await render(
      <AppearancePreferencesProvider>
        <Harness />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("state").props.children).toContain('"ready":true'),
    );
    mockSystemScheme = "dark";
    await screen.rerender(
      <AppearancePreferencesProvider>
        <Harness />
      </AppearancePreferencesProvider>,
    );
    expect(screen.getByTestId("color")).toHaveStyle({
      backgroundColor: resolvePalette("standard", true).background,
    });
    await fireEvent.press(screen.getByRole("button", { name: "Minzbrise" }));
    await fireEvent.press(screen.getByRole("button", { name: "Dunkel" }));
    mockSystemScheme = "light";
    await screen.rerender(
      <AppearancePreferencesProvider>
        <Harness />
      </AppearancePreferencesProvider>,
    );
    expect(screen.getByTestId("color")).toHaveStyle({
      backgroundColor: resolvePalette("mint", true).background,
    });
    await waitFor(() =>
      expect(mockSave).toHaveBeenLastCalledWith(expect.anything(), {
        themeId: "mint",
        mode: "dark",
      }),
    );
    await screen.unmount();
    mockLoad.mockResolvedValue({ themeId: "mint", mode: "dark" });
    const reopened = await render(
      <AppearancePreferencesProvider>
        <Harness />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() =>
      expect(reopened.getByTestId("color")).toHaveStyle({
        backgroundColor: resolvePalette("mint", true).background,
      }),
    );
  });
  it("serializes rapid changes while displaying the latest selection immediately", async () => {
    let finish: (() => void) | undefined;
    mockSave.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const screen = await render(
      <AppearancePreferencesProvider>
        <Harness />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("state").props.children).toContain('"ready":true'),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Minzbrise" }));
    await fireEvent.press(screen.getByRole("button", { name: "Dunkel" }));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("color")).toHaveStyle({
      backgroundColor: resolvePalette("mint", true).background,
    });
    await act(async () => {
      finish?.();
    });
    await waitFor(() =>
      expect(mockSave).toHaveBeenLastCalledWith(expect.anything(), {
        themeId: "mint",
        mode: "dark",
      }),
    );
  });
  it("rolls back a failed save and retries the complete selection", async () => {
    mockSave.mockRejectedValueOnce(new Error("offline storage"));
    const screen = await render(
      <AppearancePreferencesProvider>
        <Harness />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("state").props.children).toContain('"ready":true'),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Minzbrise" }));
    await waitFor(() =>
      expect(screen.getByText("Darstellung konnte nicht gespeichert werden.")).toBeTruthy(),
    );
    expect(screen.getByTestId("state").props.children).toContain('"themeId":"standard"');
    await fireEvent.press(screen.getByRole("button", { name: "Erneut" }));
    await waitFor(() => expect(screen.getByText("OK")).toBeTruthy());
    expect(mockSave).toHaveBeenLastCalledWith(expect.anything(), {
      themeId: "mint",
      mode: "system",
    });
  });
  it("keeps the app available after a load error and allows retry", async () => {
    mockLoad.mockRejectedValueOnce(new Error("storage"));
    const screen = await render(
      <AppearancePreferencesProvider>
        <Harness />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Darstellung konnte nicht geladen werden.")).toBeTruthy(),
    );
    expect(screen.getByTestId("state").props.children).toContain('"ready":true');
    await fireEvent.press(screen.getByRole("button", { name: "Erneut" }));
    await waitFor(() => expect(screen.getByText("OK")).toBeTruthy());
  });
});
