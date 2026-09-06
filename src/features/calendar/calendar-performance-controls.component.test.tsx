import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Platform, Share } from "react-native";
import { CalendarPerformanceControls } from "./calendar-performance-controls";
import { shareCalendarPerformanceFile } from "./share-calendar-performance";
import { calendarPerformance } from "@/application/calendar-performance";
let mockAvailable = true;
jest.mock("expo-file-system", () => ({ File: jest.fn(), Paths: { cache: {} } }));
jest.mock("expo-updates", () => ({ updateId: "test", runtimeVersion: "test" }));
jest.mock("@/infrastructure/dev-tools-policy", () => ({
  get DEV_TOOLS_AVAILABLE() {
    return mockAvailable;
  },
}));
describe("calendar diagnostic controls", () => {
  afterEach(() => {
    calendarPerformance.clear();
    jest.restoreAllMocks();
    mockAvailable = true;
  });
  it("does not expose recording controls in a production build", async () => {
    mockAvailable = false;
    const screen = await render(<CalendarPerformanceControls />);
    expect(screen.queryByText("Kalenderdiagnose starten")).toBeNull();
    expect(calendarPerformance.getSnapshot()).toBe(0);
  });
  it("does not delete a pre-existing file if creation fails", async () => {
    const file = {
      create: () => {
        throw new Error("exists");
      },
      write: jest.fn(),
      delete: jest.fn(),
      exists: true,
      uri: "file:///cache/diagnosis.json",
    };
    await expect(shareCalendarPerformanceFile("{}", file)).rejects.toThrow("exists");
    expect(file.delete).not.toHaveBeenCalled();
  });
  it("starts only on user action, stops and clears", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const screen = await render(<CalendarPerformanceControls />);
    expect(calendarPerformance.getSnapshot()).toBe(0);
    await fireEvent.press(screen.getByText("Kalenderdiagnose starten"));
    expect(calendarPerformance.getSnapshot()).toBeGreaterThan(0);
    await act(async () => {
      calendarPerformance.record("commit");
    });
    await fireEvent.press(screen.getByText("Kalenderdiagnose läuft – stoppen"));
    expect(calendarPerformance.getSnapshot()).toBe(0);
    await fireEvent.press(screen.getByText("Diagnosebericht verwerfen"));
    expect(calendarPerformance.report().events).toEqual([]);
  });
  it.each(["shared", "dismissed", "failure"])(
    "cleans the diagnostic export after %s",
    async (result) => {
      jest.spyOn(Share, "share").mockImplementation(async () => {
        if (result === "failure") throw new Error("failure");
        return { action: result === "shared" ? Share.sharedAction : Share.dismissedAction };
      });
      const file = {
        create: jest.fn(),
        write: jest.fn(),
        delete: jest.fn(),
        exists: true,
        uri: "file:///cache/diagnosis.json",
      };
      if (result === "failure")
        await expect(shareCalendarPerformanceFile("{}", file)).rejects.toThrow();
      else await shareCalendarPerformanceFile("{}", file);
      expect(file.write).toHaveBeenCalledWith("{}");
      expect(file.delete).toHaveBeenCalledTimes(1);
    },
  );
});
