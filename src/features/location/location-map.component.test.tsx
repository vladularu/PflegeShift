import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { View as MockView } from "react-native";

import { LocationMap } from "@/features/location/location-map.native";

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: (props: object) => <MockView {...props} testID="native-map" />,
  Marker: (props: object) => <MockView {...props} testID="native-marker" />,
}));

describe("location map", () => {
  it("updates region and marker together without replacing the native map", async () => {
    const first = { name: "Heppenheim", latitude: 49.64, longitude: 8.64 };
    const second = { name: "Berlin", latitude: 52.52, longitude: 13.405 };
    const screen = await render(<LocationMap location={first} />);
    const map = screen.getByTestId("native-map");
    expect(map.props.region).toMatchObject({
      latitude: first.latitude,
      longitude: first.longitude,
    });
    expect(map.props.initialRegion).toBeUndefined();
    await screen.rerender(<LocationMap location={second} />);
    expect(screen.getByTestId("native-map")).toBe(map);
    expect(map.props.region).toMatchObject({
      latitude: second.latitude,
      longitude: second.longitude,
    });
    expect(screen.getByTestId("native-marker").props.coordinate).toEqual(second);
    expect(map.props.pointerEvents).toBe("none");
  });
});
