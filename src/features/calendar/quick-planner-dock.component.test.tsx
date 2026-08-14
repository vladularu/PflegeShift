import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { ShiftTemplate } from "@/domain/types";
import { buildQuickEntryActions } from "@/features/calendar/quick-entry-actions";
import {
  QUICK_PLANNER_COLORS,
  QUICK_PLANNER_METRICS,
} from "@/features/calendar/quick-planner-appearance";
import { QuickPlannerDock } from "@/features/calendar/quick-planner-dock";
import { LIGHT_PALETTE } from "@/theme/palette-values";

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
}: {
  onClose?: jest.Mock;
  onOpen?: jest.Mock;
  open?: boolean;
  busy?: boolean;
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
        activeKey="template:early"
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
  it("keeps the pencil, dock and close action in one persistent synchronized control", async () => {
    const screen = await renderDock();
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
    expect(dockStyle.backgroundColor).toBe(LIGHT_PALETTE.floatingAction);
    expect(closeVisualStyle.backgroundColor).toBe(LIGHT_PALETTE.floatingAction);
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
    });
  });

  it("opens from the persistent pencil target", async () => {
    const onOpen = jest.fn();
    const screen = await renderDock({ onOpen, open: false });

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
      backgroundColor: LIGHT_PALETTE.floatingAction,
    });
  });
});
