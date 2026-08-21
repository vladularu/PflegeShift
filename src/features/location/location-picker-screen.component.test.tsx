import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";

import { LocationPickerScreen } from "@/features/location/location-picker-screen";
import { consumeLocationSelection } from "@/features/location/location-selection";

interface MockCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

interface MockAddress {
  readonly city?: string;
  readonly country?: string;
  readonly name?: string;
  readonly postalCode?: string;
  readonly region?: string;
  readonly street?: string;
  readonly streetNumber?: string;
}

const mockGeocodeAsync = jest.fn<(address: string) => Promise<readonly MockCoordinate[]>>();
const mockReverseGeocodeAsync =
  jest.fn<(coordinate: MockCoordinate) => Promise<readonly MockAddress[]>>();
const mockRequestForegroundPermissionsAsync =
  jest.fn<() => Promise<{ readonly granted: boolean }>>();
let mockCurrent: string | undefined;

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ current: mockCurrent }),
}));

jest.mock("expo-location", () => ({
  geocodeAsync: (address: string) => mockGeocodeAsync(address),
  requestForegroundPermissionsAsync: () => mockRequestForegroundPermissionsAsync(),
  reverseGeocodeAsync: (coordinate: MockCoordinate) => mockReverseGeocodeAsync(coordinate),
}));

describe("LocationPickerScreen", () => {
  beforeEach(() => {
    mockCurrent = undefined;
    mockGeocodeAsync.mockReset();
    mockGeocodeAsync.mockResolvedValue([]);
    mockReverseGeocodeAsync.mockReset();
    mockReverseGeocodeAsync.mockResolvedValue([]);
    mockRequestForegroundPermissionsAsync.mockReset();
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    jest.mocked(router.back).mockClear();
    consumeLocationSelection();
  });

  it("matches the compact reference and saves a custom location first", async () => {
    const screen = await render(<LocationPickerScreen />);

    expect(screen.getByTestId("location-picker-header")).toHaveStyle({ minHeight: 64 });
    expect(screen.getByTestId("location-picker-input-row")).toHaveStyle({ minHeight: 60 });
    expect(screen.getByRole("header", { name: "Ort" })).toBeTruthy();
    const input = screen.getByLabelText("Ort oder Adresse");
    expect(input.props.placeholder).toBe("Gib einen Ort ein");
    expect(input.props.returnKeyType).toBe("done");

    await fireEvent.changeText(input, "Station 3");
    await fireEvent.press(
      screen.getByRole("button", { name: "Station 3 als eigenen Ort verwenden" }),
    );

    expect(consumeLocationSelection()).toEqual({ name: "Station 3" });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("shows geocoded places with a separate address and saves coordinates", async () => {
    mockGeocodeAsync.mockResolvedValue([{ latitude: 50.112, longitude: 8.671 }]);
    mockReverseGeocodeAsync.mockResolvedValue([
      {
        name: "Heppy Green",
        street: "Stiftstraße",
        streetNumber: "6",
        postalCode: "60313",
        city: "Frankfurt am Main",
        region: "Hessen",
        country: "Deutschland",
      },
    ]);
    const screen = await render(<LocationPickerScreen />);

    await fireEvent.changeText(screen.getByLabelText("Ort oder Adresse"), "Hepp");

    await waitFor(() => expect(screen.getByText("Heppy Green")).toBeTruthy());
    expect(
      screen.getByText("Stiftstraße 6, 60313 Frankfurt am Main, Hessen, Deutschland"),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Heppy Green, Stiftstraße 6, 60313 Frankfurt am Main, Hessen, Deutschland",
      }),
    );

    expect(consumeLocationSelection()).toEqual({
      name: "Heppy Green",
      address: "Stiftstraße 6, 60313 Frankfurt am Main, Hessen, Deutschland",
      latitude: 50.112,
      longitude: 8.671,
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("removes an existing location only after submitting the cleared field", async () => {
    mockCurrent = "Klinikum";
    const screen = await render(<LocationPickerScreen />);
    const input = screen.getByLabelText("Ort oder Adresse");

    await fireEvent.press(screen.getByRole("button", { name: "Ortseingabe löschen" }));
    expect(consumeLocationSelection()).toBeUndefined();
    await fireEvent(input, "submitEditing");

    expect(consumeLocationSelection()).toBeNull();
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
