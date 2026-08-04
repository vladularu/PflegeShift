import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Redirect } from "expo-router";

import DevToolsRoute from "../../../app/dev-tools";
import { DevToolsScreen } from "@/features/dev-tools/dev-tools-screen";

jest.mock("expo-router", () => ({
  Redirect: jest.fn(() => null),
}));

jest.mock("@/features/dev-tools/dev-tools-screen", () => ({
  DevToolsScreen: jest.fn(() => null),
}));

jest.mock("@/infrastructure/dev-tools-policy", () => ({
  DEV_TOOLS_AVAILABLE: false,
}));

describe("production dev-tools route", () => {
  it("redirects deep links without rendering the internal screen", async () => {
    await render(<DevToolsRoute />);

    expect(Redirect).toHaveBeenCalledWith(expect.objectContaining({ href: "/" }), undefined);
    expect(DevToolsScreen).not.toHaveBeenCalled();
  });
});
