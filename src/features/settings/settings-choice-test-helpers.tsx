import { expect } from "@jest/globals";
import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { SettingsEditorScreen } from "./settings-editor-screen";
import {
  ProfileSelectionProvider,
  ProfileSelectionScreen,
  useProfileSelection,
} from "./profile-selection";
type Screen = Awaited<ReturnType<typeof render>>;
function SelectionTestPage() {
  const { request } = useProfileSelection();
  return request ? <ProfileSelectionScreen /> : null;
}
export function SettingsEditorTestFlow() {
  return (
    <ProfileSelectionProvider>
      <SettingsEditorScreen />
      <SelectionTestPage />
    </ProfileSelectionProvider>
  );
}
export async function selectSettingsChoice(screen: Screen, field: string, option: string) {
  if (field === "Berechnung" && option === "Monatsbrutto selbst eintragen") {
    await fireEvent.press(screen.getByRole("tab", { name: "Eigenes Brutto" }));
    return [];
  }
  const mapped =
    field === "Berechnung"
      ? "Tarifvertrag"
      : field === "Tarifgebiet"
        ? "Tarifregion"
        : field === "Tarifbereich"
          ? "Einrichtung"
          : field === "Tarifliche Vollzeit pro Woche"
            ? "Vollzeit laut Tarif"
            : field;
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${mapped}:`) }));
  const page = within(screen.getByTestId("profile-selection-content"));
  const choices = page
    .getAllByRole("button")
    .filter((button) => typeof button.props.accessibilityState?.selected === "boolean")
    .map((button) => button.props.accessibilityLabel as string);
  const next =
    field === "Tarifbereich"
      ? option
          .replace("Krankenhaus · BT-K", "Krankenhaus (BT-K)")
          .replace("Pflege · BT-B", "Pflegeeinrichtung (BT-B)")
      : field === "Tarifliche Vollzeit pro Woche"
        ? `${option} Std.`
        : option;
  await fireEvent.press(page.getByRole("button", { name: next }));
  await waitFor(() => expect(screen.queryByTestId("profile-selection-content")).toBeNull());
  return field === "Tarifliche Vollzeit pro Woche"
    ? choices.map((label) => label.replace(" Std.", ""))
    : choices;
}

export async function chooseTariffGroup(screen: Screen, tariff: string) {
  const group =
    tariff === "TVöD-P"
      ? "P8"
      : tariff === "TVöD VKA · E-Tabelle"
        ? "E9b"
        : tariff.startsWith("TV-UK")
          ? "P-UK8"
          : "KR8";
  await selectSettingsChoice(screen, "Entgeltgruppe", group);
}
export async function chooseTariffDetails(screen: Screen, tariff: string) {
  if (tariff.startsWith("TVA"))
    await selectSettingsChoice(screen, "Ausbildungsjahr", "2. Ausbildungsjahr");
  else {
    await chooseTariffGroup(screen, tariff);
    await selectSettingsChoice(screen, "Stufe", "Stufe 4");
  }
}
