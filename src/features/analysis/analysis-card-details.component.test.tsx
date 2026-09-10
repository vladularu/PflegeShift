import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import * as Reanimated from "react-native-reanimated";

import { AnalysisCardDetails } from "@/features/analysis/analysis-card-details";
import { ExpandableHighlightCard } from "@/features/analysis/expandable-highlight-card";
import { MOTION } from "@/theme/motion";

jest.mock("react-native-reanimated", () => {
  const actual =
    jest.requireActual<typeof import("react-native-reanimated")>("react-native-reanimated");
  return { __esModule: true, ...actual, withTiming: jest.fn(actual.withTiming) };
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AnalysisCardDetails", () => {
  it("measures independently, clips content and uses one retargetable height animation", async () => {
    const timing = jest.mocked(Reanimated.withTiming);
    const content = <Text>Details</Text>;
    const screen = await render(
      <AnalysisCardDetails expanded={false}>{content}</AnalysisCardDetails>,
    );
    const measure = async (height: number) => {
      // Native layout still fires inside a touch-disabled, collapsed viewport.
      await act(() => {
        screen
          .getByTestId("analysis-card-details-content", { includeHiddenElements: true })
          .props.onLayout({
            nativeEvent: { layout: { x: 0, y: 0, width: 350, height } },
          });
      });
    };

    await measure(420);
    expect(
      screen.getByTestId("analysis-card-details", { includeHiddenElements: true }),
    ).toHaveStyle({ overflow: "hidden" });
    expect(
      screen.getByTestId("analysis-card-details-content", { includeHiddenElements: true }),
    ).toHaveStyle({
      position: "absolute",
      left: 0,
      right: 0,
    });
    expect(screen.queryByText("Details")).toBeNull();
    const config = {
      duration: MOTION.duration.deliberate,
      easing: MOTION.easing.calm,
      reduceMotion: MOTION.reduceMotion,
    };
    expect(timing).toHaveBeenLastCalledWith(0, config);

    await screen.rerender(<AnalysisCardDetails expanded>{content}</AnalysisCardDetails>);
    await waitFor(() => expect(timing).toHaveBeenLastCalledWith(420, config));
    await measure(600); // Dynamic Type / updated content while open.
    await waitFor(() => expect(timing).toHaveBeenLastCalledWith(600, config));
    await screen.rerender(<AnalysisCardDetails expanded={false}>{content}</AnalysisCardDetails>);
    await waitFor(() => expect(timing).toHaveBeenLastCalledWith(0, config));
    await screen.rerender(<AnalysisCardDetails expanded>{content}</AnalysisCardDetails>);
    await waitFor(() => expect(timing).toHaveBeenLastCalledWith(600, config));
    expect(screen.getByTestId("analysis-card-details").props.entering).toBeUndefined();
    expect(screen.getByTestId("analysis-card-details").props.exiting).toBeUndefined();
    expect(screen.getByTestId("analysis-card-details").props.layout).toBeUndefined();
  });

  it("keeps children mounted while removing closed details from interaction and accessibility", async () => {
    const mount = jest.fn();
    const unmount = jest.fn();
    function Content() {
      useEffect(() => {
        mount();
        return () => {
          unmount();
        };
      }, []);
      return <Text>Persistent detail</Text>;
    }
    const screen = await render(
      <AnalysisCardDetails expanded>
        <Content />
      </AnalysisCardDetails>,
    );
    await screen.rerender(
      <AnalysisCardDetails expanded={false}>
        <Content />
      </AnalysisCardDetails>,
    );
    const viewport = screen.getByTestId("analysis-card-details", { includeHiddenElements: true });
    expect(viewport.props.pointerEvents).toBe("none");
    expect(viewport.props.accessibilityElementsHidden).toBe(true);
    expect(viewport.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(screen.queryByText("Persistent detail")).toBeNull();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(unmount).not.toHaveBeenCalled();
    await screen.rerender(
      <AnalysisCardDetails expanded>
        <Content />
      </AnalysisCardDetails>,
    );
    expect(screen.getByTestId("analysis-card-details").props.pointerEvents).toBe("auto");
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest selected card accessible during rapid alternating taps", async () => {
    function Pair() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <View>
          {["Prüfung", "Gehalt"].map((title) => (
            <ExpandableHighlightCard
              key={title}
              title={title}
              value="Test"
              icon="wallet-outline"
              accent="#74515F"
              expanded={selected === title}
              onToggle={() => setSelected((current) => (current === title ? null : title))}
            >
              <Text>{title} Details</Text>
            </ExpandableHighlightCard>
          ))}
        </View>
      );
    }
    const screen = await render(<Pair />);
    for (let i = 0; i < 10; i += 1) {
      const title = i % 2 === 0 ? "Prüfung" : "Gehalt";
      const other = title === "Prüfung" ? "Gehalt" : "Prüfung";
      await fireEvent.press(screen.getByRole("button", { name: title + ", Test" }));
      expect(screen.getByText(title + " Details")).toBeTruthy();
      expect(screen.queryByText(other + " Details")).toBeNull();
    }
    await fireEvent.press(screen.getByRole("button", { name: "Gehalt, Test" }));
    expect(screen.queryByText("Gehalt Details")).toBeNull();
    expect(screen.queryByText("Prüfung Details")).toBeNull();
  });
});
