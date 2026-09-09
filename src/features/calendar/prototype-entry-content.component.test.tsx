import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { ShiftEntry } from "@/domain/types";
import { PrototypeEntryContent } from "./prototype-entry-content";

jest.mock("@/ui/shift-symbol", () => ({ ShiftSymbol: () => null }));
const shift: ShiftEntry = {
  kind: "SHIFT",
  id: "real",
  date: "2026-09-09",
  templateId: null,
  title: "Früh",
  type: "EARLY",
  startTime: "07:00",
  endTime: "15:00",
  breakMinutes: 30,
  color: "#348765",
  symbol: "sunrise",
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};
describe("prototype real shift content", () => {
  it("honors title, time and duration options without entrance animations", async () => {
    const screen = await render(
      <PrototypeEntryContent
        entry={shift}
        display={{ labelMode: "FULL", showShiftTimes: true, showShiftDuration: false }}
        timeZone="Europe/Berlin"
      />,
    );
    expect(screen.getByText("Früh")).toBeTruthy();
    expect(screen.getByText("07:00")).toBeTruthy();
    await screen.rerender(
      <PrototypeEntryContent
        entry={shift}
        display={{ labelMode: "SHORT", showShiftTimes: false, showShiftDuration: false }}
        timeZone="Europe/Berlin"
      />,
    );
    expect(screen.getByText("F")).toBeTruthy();
    expect(screen.queryByText("07:00")).toBeNull();
    await screen.rerender(
      <PrototypeEntryContent
        entry={shift}
        display={{ labelMode: "SYMBOL", showShiftTimes: false, showShiftDuration: true }}
        timeZone="Europe/Berlin"
      />,
    );
    expect(screen.queryByText("F")).toBeNull();
    expect(screen.getByText("7:30 h")).toBeTruthy();
  });
  it("does not show a time row for all-day shifts", async () => {
    const screen = await render(
      <PrototypeEntryContent
        entry={{ ...shift, allDay: true, startTime: null, endTime: null }}
        display={{ labelMode: "FULL", showShiftTimes: true, showShiftDuration: true }}
        timeZone="Europe/Berlin"
      />,
    );
    expect(screen.getByText("Früh")).toBeTruthy();
    expect(screen.queryByText(/07:00|7:30/)).toBeNull();
  });
});
