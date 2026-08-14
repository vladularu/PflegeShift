import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";

import { TemplatesManagerScreen } from "@/features/templates/templates-manager-screen";
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
