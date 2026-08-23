import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";

import { TemplatesManagerScreen } from "@/features/templates/templates-manager-screen";
import { RADII } from "@/theme/tokens";
import { FeedbackProvider } from "@/ui/feedback";

const mockMoveTemplate = jest.fn<() => Promise<void>>();
const mockRemoveTemplate = jest.fn<() => Promise<void>>();

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => effect(),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
  usePflegeShiftTemplates: () => ({
    templates: [
      {
        id: "early",
        name: "Früh",
        type: "EARLY",
        startTime: "06:00",
        endTime: "14:00",
        breakMinutes: 30,
        color: "#7954C7",
        symbol: "F",
        sortOrder: 10,
        revision: 1,
        deletedAt: null,
      },
    ],
    moveTemplate: mockMoveTemplate,
    removeTemplate: mockRemoveTemplate,
  }),
}));

const mockPush = jest.mocked(router.push);

describe("TemplatesManagerScreen", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("opens a template directly when its row is pressed", async () => {
    const screen = await render(
      <FeedbackProvider>
        <TemplatesManagerScreen />
      </FeedbackProvider>,
    );

    await fireEvent.press(screen.getByText("Früh"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/template-editor",
      params: { id: "early" },
    });
    expect(screen.getByText("Meine Dienste")).toBeVisible();
    expect(screen.getByTestId("templates-manager-scroll").props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: "100%", maxWidth: 560, alignSelf: "center" }),
      ]),
    );
    expect(screen.getByTestId("template-manager-list")).toHaveStyle({
      borderRadius: RADII.large,
    });
    expect(screen.getByTestId("template-manager-row-early")).toHaveStyle({ minHeight: 72 });
    expect(screen.getByTestId("template-manager-row-early-badge")).toHaveStyle({
      width: 38,
      height: 38,
      borderRadius: RADII.pill,
    });
    expect(screen.getByTestId("template-manager-row-early-more-circle")).toHaveStyle({
      width: 22,
      height: 22,
      borderRadius: RADII.pill,
    });
    expect(screen.getByTestId("template-manager-add-row")).toHaveStyle({ minHeight: 64 });
    expect(screen.getByText("Schicht hinzufügen")).toBeVisible();
  });

  it("opens management actions without also opening the editor", async () => {
    const screen = await render(
      <FeedbackProvider>
        <TemplatesManagerScreen />
      </FeedbackProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Früh verwalten" }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy();
  });
});
