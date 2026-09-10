import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { ShiftTemplate } from "@/domain/types";
import { buildQuickEntryActions } from "@/features/calendar/quick-entry-actions";
import {
  QUICK_PLANNER_COLORS,
  QUICK_PLANNER_METRICS,
} from "@/features/calendar/quick-planner-appearance";
import {
  QuickPlannerDock,
  quickPlannerTransitionDuration,
} from "@/features/calendar/quick-planner-dock";
import { MOTION } from "@/theme/motion";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";

jest.mock("@expo/vector-icons/Ionicons", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return function Icon({ name }: { name: string }) {
    return <Text>{name}</Text>;
  };
});

const TEMPLATE: ShiftTemplate = {
  id: "early",
  name: "Früh",
  type: "EARLY",
  startTime: "06:00",
  endTime: "14:12",
  breakMinutes: 30,
  color: "#62B94C",
  symbol: "F",
  sortOrder: 10,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  revision: 1,
};

function renderDock({
  onClose = jest.fn(),
  onOpen = jest.fn(),
  open = true,
  busy = false,
  activeKey = "template:early",
}: {
  onClose?: jest.Mock;
  onOpen?: jest.Mock;
  open?: boolean;
  busy?: boolean;
  activeKey?: string | null;
} = {}) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 932, width: 430, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 59 },
      }}
    >
      <QuickPlannerDock
        actions={buildQuickEntryActions([TEMPLATE]).slice(0, 1)}
        activeKey={activeKey}
        busy={busy}
        onOpen={onOpen}
        onClose={onClose}
        onSelectAction={jest.fn()}
        open={open}
      />
    </SafeAreaProvider>,
  );
}

describe("QuickPlannerDock", () => {
  beforeEach(() => {
    jest
      .spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useColorScheme")
      .mockReturnValue("light");
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([false, true])("inverts open controls and inactive text (dark=%s)", async (dark) => {
    jest
      .spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useColorScheme")
      .mockReturnValue(dark ? "dark" : "light");
    const inverse = dark ? LIGHT_PALETTE : DARK_PALETTE;
    const screen = await renderDock({ activeKey: null });
    expect(screen.getByTestId("quick-planner-dock")).toHaveStyle({
      backgroundColor: inverse.surface,
    });
    expect(screen.getByTestId("quick-planner-close-visual")).toHaveStyle({
      backgroundColor: inverse.surface,
    });
    expect(screen.getByText("Früh")).toHaveStyle({ color: inverse.text });
  });
  it("keeps the pencil, dock and close action in one persistent synchronized control", async () => {
    const screen = await renderDock();
    const mountReveal = screen.getByTestId("quick-planner-mount-reveal");
    const stack = screen.getByTestId("quick-planner-stack");
    const closeRow = screen.getByTestId("quick-planner-close-row");
    const closeTarget = screen.getByTestId("quick-planner-close-hit-target");
    const closeVisual = screen.getByTestId("quick-planner-close-visual");
    const dock = screen.getByTestId("quick-planner-dock");
    const pencil = screen.getByTestId("quick-planner-pencil-anchor");
    const stackStyle = StyleSheet.flatten(stack.props.style);
    const closeRowStyle = StyleSheet.flatten(closeRow.props.style);
    const closeTargetStyle = StyleSheet.flatten(closeTarget.props.style);
    const closeVisualStyle = StyleSheet.flatten(closeVisual.props.style);
    const dockStyle = StyleSheet.flatten(dock.props.style);

    expect(stackStyle.position).toBe("absolute");
    expect(mountReveal).toContainElement(stack);
    expect(stackStyle.bottom).toBe(-24);
    expect(stackStyle.left).toBe(8);
    expect(stackStyle.right).toBe(8);
    expect(stack).toContainElement(pencil);
    expect(stack).toContainElement(closeRow);
    expect(stack).toContainElement(dock);
    expect(closeRowStyle.position).toBe("absolute");
    expect(closeRowStyle.right).toBe(2);
    expect(closeTargetStyle.width).toBe(QUICK_PLANNER_METRICS.closeTargetSize);
    expect(closeTargetStyle.height).toBe(QUICK_PLANNER_METRICS.closeTargetSize);
    expect(closeVisualStyle.width).toBe(QUICK_PLANNER_METRICS.closeVisualSize);
    expect(closeVisualStyle.height).toBe(QUICK_PLANNER_METRICS.closeVisualSize);
    expect(
      closeRowStyle.bottom -
        QUICK_PLANNER_METRICS.dockHeight +
        (closeTargetStyle.height - closeVisualStyle.height) / 2,
    ).toBe(QUICK_PLANNER_METRICS.closeVisualGap);
    expect(dockStyle.height).toBe(QUICK_PLANNER_METRICS.dockHeight);
    expect(dockStyle.borderRadius).toBe(QUICK_PLANNER_METRICS.dockHeight / 2);
    expect(dockStyle.backgroundColor).toBe(DARK_PALETTE.surface);
    expect(closeVisualStyle.backgroundColor).toBe(DARK_PALETTE.surface);
    expect(screen.queryByTestId("quick-planner-dock-shell")).toBeNull();
    expect(screen.queryByText("Fertig")).toBeNull();
  });

  it("shows the active template with the SuperShift-style blue selection ring", async () => {
    const screen = await renderDock();
    const activeBadge = screen.getByTestId("quick-planner-badge-template:early");

    expect(activeBadge).toHaveStyle({
      borderWidth: 2,
      borderColor: QUICK_PLANNER_COLORS.active,
    });
    expect(screen.getByText("Früh")).toHaveStyle({ color: QUICK_PLANNER_COLORS.active });
  });

  it("starts the reverse morph before ending planning mode", async () => {
    const onClose = jest.fn();
    const screen = await renderDock({ onClose });

    await fireEvent.press(screen.getByRole("button", { name: "Planung beenden" }));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("quick-planner-close-row").props.pointerEvents).toBe("none");
      expect(screen.getByTestId("quick-planner-dock").props.pointerEvents).toBe("none");
      expect(screen.getByTestId("quick-planner-pencil-anchor").props.pointerEvents).toBe("none");
    });
  });

  it("uses responsive scene timings and an instant reduced-motion fallback", () => {
    expect(quickPlannerTransitionDuration(true, false)).toBe(MOTION.duration.scene);
    expect(quickPlannerTransitionDuration(false, false)).toBe(MOTION.duration.deliberate);
    expect(quickPlannerTransitionDuration(true, true)).toBe(MOTION.duration.instant);
  });

  it("opens from the persistent pencil target", async () => {
    const onOpen = jest.fn();
    const screen = await renderDock({ onOpen, open: false });
    expect(
      screen.getByText("add", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByText("pencil", {
        includeHiddenElements: true,
      }),
    ).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Dienstplan bearbeiten" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("quick-planner-dock")).toBeTruthy();
    expect(screen.getByTestId("quick-planner-close-hit-target")).toBeTruthy();
  });

  it("keeps the dock visually stable while an entry is being saved", async () => {
    const screen = await renderDock({ busy: true });
    const action = screen.getByRole("button", { name: "Früh auswählen" });

    expect(StyleSheet.flatten(action.props.style).opacity).not.toBe(0.42);
    expect(screen.getByTestId("quick-planner-dock")).toHaveStyle({
      backgroundColor: DARK_PALETTE.surface,
    });
  });
});
