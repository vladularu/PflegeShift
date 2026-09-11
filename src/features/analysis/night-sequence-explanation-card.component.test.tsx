import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { NightSequenceExplanationCard } from "./night-sequence-explanation-card";
import { explainNightSequence } from "./night-sequence-explanation";

jest.mock("./night-sequence-explanation", () => ({ explainNightSequence: jest.fn() }));
const explainMock = jest.mocked(explainNightSequence);

describe("optional night explanation", () => {
  it("does no extra computation until opened and has no new inputs", async () => {
    explainMock.mockClear();
    explainMock.mockReturnValue({
      title: "Passende Nachtdienstfolge gefunden",
      dates: ["2026-07-02", "2026-07-23", "2026-07-24"],
      deadline: "2026-08-03",
      hasAbsence: false,
      uncertain: false,
    });
    const screen = await render(
      <NightSequenceExplanationCard entries={[]} month="2026-07" timeZone="Europe/Berlin" />,
    );
    expect(explainMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Einschätzung erklären", expanded: false }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Einschätzung erklären"));
    expect(explainMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Passende Nachtdienstfolge gefunden")).toBeTruthy();
    expect(screen.getByText(/02.07.2026/)).toBeTruthy();
    expect(screen.getByText(/Gehaltswert.*unverändert/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Einschätzung erklären"));
    expect(screen.queryByText("Passende Nachtdienstfolge gefunden")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
  it("refreshes opened details when calendar data changes and explains absence", async () => {
    explainMock.mockReturnValue({
      title: "Noch nicht eindeutig",
      dates: [],
      deadline: null,
      hasAbsence: true,
      uncertain: true,
    });
    const entries: never[] = [];
    const screen = await render(
      <NightSequenceExplanationCard entries={entries} month="2026-07" timeZone="Europe/Berlin" />,
    );
    await fireEvent.press(screen.getByText("Einschätzung erklären"));
    expect(screen.getByText(/Urlaub oder Krankheit/)).toBeTruthy();
    explainMock.mockClear();
    await screen.rerender(
      <NightSequenceExplanationCard entries={[]} month="2026-08" timeZone="Europe/Berlin" />,
    );
    expect(explainMock).toHaveBeenCalledWith([], "2026-08", "Europe/Berlin");
  });
  it("keeps a failed explanation local rather than crashing the salary screen", async () => {
    explainMock.mockImplementation(() => {
      throw new Error("invalid time zone");
    });
    const screen = await render(
      <NightSequenceExplanationCard entries={[]} month="2026-07" timeZone="invalid" />,
    );
    await fireEvent.press(screen.getByText("Einschätzung erklären"));
    expect(screen.getByText("Einschätzung derzeit nicht verfügbar")).toBeTruthy();
  });
});
