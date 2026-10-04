import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert, StyleSheet } from "react-native";
import type { useRemunerationHistory } from "@/application/remuneration-provider";
import type {
  MonthlyAllowanceDecisions,
  SaveMonthlyAllowanceDecisionsInput,
} from "@/domain/allowance-decisions";
import { ConcurrencyError } from "@/domain/errors";
import type { MonthlyTariffDecision } from "@/domain/types";
import { history, resolver, work } from "@/engine/remuneration-test-fixtures";
import trainingValue from "../../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import tvlValue from "../../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import tvalValue from "../../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import { tvlProfile } from "@/engine/tvl-shift-work-test-fixtures";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { calculateMonthlyDatedAllowances } from "@/engine/remuneration-allowances";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { successFeedback } from "@/ui/haptics";
import { AllowanceConfirmationScreen } from "./allowance-confirmation-screen";

const mockSave =
  jest.fn<(input: SaveMonthlyAllowanceDecisionsInput) => Promise<MonthlyAllowanceDecisions>>();
const mockReload = jest.fn<() => Promise<void>>();
let mockHistory: ReturnType<typeof useRemunerationHistory>;
let mockLegacy: readonly MonthlyTariffDecision[] = [];
let mockPalette = LIGHT_PALETTE;
let mockResolver = resolver();
const tariff = { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" };
const existing: MonthlyAllowanceDecisions = {
  month: "2026-09",
  revision: 3,
  updatedAt: "2026-09-01T00:00:00Z",
  decisions: [
    {
      from: "2026-09-01",
      through: "2026-09-30",
      tariff,
      allowanceStatus: "SHIFT_MONTHLY",
      revision: 3,
      confirmedAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    },
  ],
};
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationHistory: () => mockHistory,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftTariff: () => ({ tariffDecisions: mockLegacy }),
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockResolver }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));
jest.mock("@/ui/loading-view", () => {
  const { Text, Button } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    LoadingView: () => <Text>Lädt</Text>,
    LoadFailureView: ({ message, onRetry }: { message: string; onRetry: () => void }) => (
      <>
        <Text>{message}</Text>
        <Button title="Erneut versuchen" onPress={onRetry} />
      </>
    ),
  };
});
jest.mock("@/ui/form-layout", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    FormScreen: ({ children }: React.PropsWithChildren) => children,
    FormSection: ({
      children,
      title,
      caption,
    }: React.PropsWithChildren<{ title: string; caption?: string }>) => (
      <>
        <Text>{title}</Text>
        {caption ? <Text>{caption}</Text> : null}
        {children}
      </>
    ),
    FormStatus: ({ error, message }: { error?: string; message?: string }) => (
      <>
        {error ? <Text>{error}</Text> : null}
        {message ? <Text>{message}</Text> : null}
      </>
    ),
  };
});
jest.mock("@/ui/form-controls", () => {
  const { Button, TextInput, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const Action = ({
    children,
    onPress,
    disabled,
    busy,
  }: React.PropsWithChildren<{
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
  }>) => (
    <Button
      title={Array.isArray(children) ? children.join("") : String(children)}
      onPress={onPress}
      disabled={disabled || busy}
    />
  );
  return {
    PrimaryButton: Action,
    SecondaryButton: Action,
    Field: ({ label, ...props }: { label: string }) => (
      <TextInput accessibilityLabel={label} {...props} />
    ),
    DropdownField: ({
      label,
      value,
      options,
      onChange,
    }: {
      label: string;
      value: string;
      options: readonly { value: string; label: string }[];
      onChange: (value: string) => void;
    }) => (
      <View>
        {options.map((option) => (
          <Button
            key={option.value}
            title={label + ": " + option.label}
            accessibilityState={{ selected: value === option.value }}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    ),
  };
});
const screenElement = (month = "2026-09") => (
  <AllowanceConfirmationScreen key={month} month={month} onClose={() => {}} />
);
type Screen = Awaited<ReturnType<typeof render>>;
async function choose(screen: Screen) {
  await fireEvent.press(screen.getByRole("button", { name: "Zeitraum ab 01.09.2026 wählen" }));
  await fireEvent.press(screen.getByRole("button", { name: "Zulagenart: Keine Zulage" }));
}
async function submit(screen: Screen) {
  await fireEvent.press(screen.getByRole("button", { name: "Zeitraum bestätigen" }));
}
beforeEach(() => {
  jest.clearAllMocks();
  mockResolver = resolver();
  mockPalette = LIGHT_PALETTE;
  mockLegacy = [];
  mockReload.mockResolvedValue(undefined);
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [history()],
    allowanceDecisions: [],
    reload: mockReload,
    saveProfile: jest.fn<ReturnType<typeof useRemunerationHistory>["saveProfile"]>(),
    saveAllowanceDecisions: mockSave,
  };
  mockSave.mockImplementation(async (input) => ({
    month: input.month,
    revision: input.expectedRevision + 1,
    updatedAt: "2026-09-22T00:00:00Z",
    decisions: input.decisions.map((decision) => ({
      ...decision,
      revision: input.expectedRevision + 1,
      confirmedAt: "2026-09-22T00:00:00Z",
      updatedAt: "2026-09-22T00:00:00Z",
    })),
  }));
});

describe("dated allowance confirmation form", () => {
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves and explicitly revokes TVA-L confirmations without retaining a payable claim",
    async (palette) => {
      mockPalette = palette;
      mockResolver = resolver([tvalValue as RuleTariffPackage]);
      const profile = {
        ...history(),
        data: {
          version: 6 as const,
          weeklyMinutes: 2310,
          selection: {
            kind: "tariff" as const,
            packageId: "tval-pflege-tdl",
            variant: "CARE",
            region: "WEST_38_5",
            group: "regular",
            level: "1",
            fullTimeWeeklyMinutes: 2310,
            tvalEmployerScope: "SECTION_43" as const,
          },
        },
      };
      mockHistory = { ...mockHistory, profiles: [profile] };
      const screen = await render(screenElement());
      await fireEvent.press(screen.getByRole("button", { name: "Zeitraum ab 01.09.2026 wählen" }));
      await fireEvent.press(
        screen.getByRole("button", { name: "Zulagenart: Ständige Wechselschicht" }),
      );
      await submit(screen);
      const saved = await (mockSave.mock.results[0].value as Promise<MonthlyAllowanceDecisions>);
      expect(saved.decisions[0].tariff.packageId).toBe("tval-pflege-tdl");
      const calculate = (row: MonthlyAllowanceDecisions) =>
        calculateMonthlyDatedAllowances(
          "2026-09",
          [],
          work,
          [profile],
          row.decisions.map((d) => ({
            from: d.from,
            through: d.through,
            status: d.allowanceStatus,
            origin: "confirmed" as const,
            revision: d.revision,
          })),
          mockResolver,
        ).positions.find((p) => p.id.startsWith("tval-shift-allowance:"))!.amountCents;
      expect(calculate(saved)).toBe(18750);
      mockHistory = { ...mockHistory, allowanceDecisions: [saved] };
      await screen.rerender(screenElement());
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      try {
        await fireEvent.press(
          screen.getByRole("button", { name: "Zeitbezogene Bestätigungen entfernen" }),
        );
        expect(mockSave).toHaveBeenCalledTimes(1);
        await act(async () => alert.mock.calls[0][2]![1].onPress?.());
        const removed = await (mockSave.mock.results[1]
          .value as Promise<MonthlyAllowanceDecisions>);
        expect(removed.decisions).toEqual([]);
        expect(calculate(removed)).toBeNull();
      } finally {
        alert.mockRestore();
      }
    },
  );
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves explicit TV-L shift allowances in either theme",
    async (palette) => {
      mockPalette = palette;
      mockResolver = resolver([tvlValue as RuleTariffPackage]);
      const profile = tvlProfile();
      mockHistory = { ...mockHistory, profiles: [profile] };
      const screen = await render(screenElement());
      expect(screen.getByText(/TV-L\/KR · Schichtzulage/)).toBeTruthy();
      expect(mockSave).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByRole("button", { name: "Zeitraum ab 01.09.2026 wählen" }));
      await fireEvent.press(
        screen.getByRole("button", { name: "Zulagenart: Ständige Wechselschicht" }),
      );
      await submit(screen);
      expect(mockSave).toHaveBeenCalledTimes(1);
      const saved = mockSave.mock.calls[0][0].decisions[0];
      expect(saved.tariff).toEqual({
        packageId: "tvl-kr-tdl",
        variant: "SECTION_43",
        region: "WEST_38_5",
      });
      const calculated = calculateMonthlyDatedAllowances(
        "2026-09",
        [],
        work,
        [profile],
        [
          {
            from: saved.from,
            through: saved.through,
            status: saved.allowanceStatus,
            origin: "confirmed",
            revision: 1,
          },
        ],
        mockResolver,
      );
      expect(calculated.knownSubtotalCents).toBe(25000);
      expect(calculated.complete).toBe(false);
      expect(screen.getByText("Zulage für den gewählten Zeitraum bestätigt.")).toBeTruthy();
    },
  );
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves a training confirmation and calculates its own amount in either theme",
    async (palette) => {
      mockPalette = palette;
      mockResolver = resolver([trainingValue as RuleTariffPackage]);
      const profile = history();
      if (profile.data.selection.kind !== "tariff") throw new Error("fixture");
      const training = {
        ...profile,
        data: {
          ...profile.data,
          selection: {
            ...profile.data.selection,
            packageId: "tvaoed-pflege-vka",
            group: "b",
            level: "1",
          },
        },
      };
      mockHistory = { ...mockHistory, profiles: [training] };
      const screen = await render(screenElement());
      expect(screen.getByText(/TVAöD-Pflege/)).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Zeitraum ab 01.09.2026 wählen" }));
      await fireEvent.press(
        screen.getByRole("button", { name: "Zulagenart: Ständige Wechselschicht" }),
      );
      await submit(screen);
      const saved = mockSave.mock.calls[0][0].decisions[0];
      expect(saved.tariff.packageId).toBe("tvaoed-pflege-vka");
      const calculation = calculateMonthlyDatedAllowances(
        "2026-09",
        [],
        work,
        [training],
        [
          {
            from: saved.from,
            through: saved.through,
            status: saved.allowanceStatus,
            origin: "confirmed",
            revision: 1,
          },
        ],
        mockResolver,
      );
      expect(
        calculation.positions.find((p) => p.basis.allowanceType === "alternating-shift"),
      ).toMatchObject({ amountCents: 18750, status: "calculated" });
      expect(calculation.complete).toBe(false); // Special-duty allowance remains unconfirmed.
    },
  );
  it("starts without dates or implicit status and never saves on opening or selecting a period", async () => {
    const screen = await render(screenElement());
    expect(screen.getByLabelText("Gültig von").props.value).toBe("");
    expect(
      screen.getByRole("button", { name: "Zulagenart: Bitte auswählen" }).props.accessibilityState
        .selected,
    ).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Zeitraum ab 01.09.2026 wählen" }));
    await submit(screen);
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByText("Bitte die Zulagenart ausdrücklich auswählen.")).toBeTruthy();
  });
  it("saves the explicit tariff identity and advances its revision for subsequent edits", async () => {
    const screen = await render(screenElement());
    await choose(screen);
    await submit(screen);
    expect(mockSave).toHaveBeenCalledWith({
      month: "2026-09",
      expectedRevision: 0,
      decisions: [{ from: "2026-09-01", through: "2026-09-30", tariff, allowanceStatus: "NONE" }],
    });
    expect(screen.getByText("Zulage für den gewählten Zeitraum bestätigt.")).toBeTruthy();
    await submit(screen);
    expect(mockSave.mock.calls[1][0].expectedRevision).toBe(1);
    expect(successFeedback).toHaveBeenCalledTimes(2);
  });
  it("preserves untouched dates when replacing the middle of an existing confirmation", async () => {
    mockHistory = { ...mockHistory, allowanceDecisions: [existing] };
    const screen = await render(screenElement());
    await choose(screen);
    await fireEvent.changeText(screen.getByLabelText("Gültig von"), "10.09.2026");
    await fireEvent.changeText(screen.getByLabelText("Gültig bis"), "20.09.2026");
    await submit(screen);
    expect(mockSave.mock.calls[0][0]).toEqual({
      month: "2026-09",
      expectedRevision: 3,
      decisions: [
        { from: "2026-09-01", through: "2026-09-09", tariff, allowanceStatus: "SHIFT_MONTHLY" },
        { from: "2026-09-10", through: "2026-09-20", tariff, allowanceStatus: "NONE" },
        { from: "2026-09-21", through: "2026-09-30", tariff, allowanceStatus: "SHIFT_MONTHLY" },
      ],
    });
  });
  it("requires a dated selection before an old monthly value is reconfirmed", async () => {
    mockLegacy = [
      {
        month: "2026-09",
        allowanceStatus: "SHIFT_MONTHLY",
        revision: 1,
        confirmedAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ];
    const screen = await render(screenElement());
    await fireEvent.press(screen.getByRole("button", { name: "Bisherigen Wert auswählen" }));
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Gültig von").props.value).toBe("");
    await fireEvent.press(screen.getByRole("button", { name: "Zeitraum ab 01.09.2026 wählen" }));
    await submit(screen);
    expect(mockSave.mock.calls[0][0].decisions[0].allowanceStatus).toBe("SHIFT_MONTHLY");
  });
  it("rejects invalid and out-of-month dates without losing input", async () => {
    const screen = await render(screenElement());
    await choose(screen);
    for (const value of ["31.09.2026", "01.10.2026"]) {
      await fireEvent.changeText(screen.getByLabelText("Gültig bis"), value);
      await submit(screen);
      expect(screen.getByLabelText("Gültig bis").props.value).toBe(value);
    }
    expect(mockSave).not.toHaveBeenCalled();
  });
  it("blocks duplicate saves while a write is pending", async () => {
    let complete!: (value: MonthlyAllowanceDecisions) => void;
    mockSave.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const screen = await render(screenElement());
    await choose(screen);
    await submit(screen);
    await submit(screen);
    expect(mockSave).toHaveBeenCalledTimes(1);
    await act(async () => complete(existing));
    expect(successFeedback).toHaveBeenCalledTimes(1);
  });
  it.each(["profile", "decision", "loading"] as const)(
    "retains the draft and blocks a changed loaded source: %s",
    async (source) => {
      mockHistory = { ...mockHistory, allowanceDecisions: [existing] };
      const screen = await render(screenElement());
      await choose(screen);
      if (source === "profile") {
        const old = mockHistory.profiles[0];
        mockHistory = {
          ...mockHistory,
          profiles: [{ ...old, data: { ...old.data, weeklyMinutes: 1200 } }],
        };
      } else if (source === "decision") {
        mockHistory = {
          ...mockHistory,
          allowanceDecisions: [
            {
              ...existing,
              decisions: [{ ...existing.decisions[0], allowanceStatus: "ALTERNATING_MONTHLY" }],
            },
          ],
        };
      } else {
        mockHistory = { ...mockHistory, status: "loading" };
      }
      await screen.rerender(screenElement());
      await submit(screen);
      expect(mockSave).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Gültig von").props.value).toBe("01.09.2026");
      expect(screen.getByLabelText("Gültig bis").props.value).toBe("30.09.2026");
    },
  );
  it("blocks a previously opened removal dialog after loading changes", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    try {
      mockHistory = { ...mockHistory, allowanceDecisions: [existing] };
      const screen = await render(screenElement());
      await choose(screen);
      await fireEvent.press(
        screen.getByRole("button", { name: "Zeitbezogene Bestätigungen entfernen" }),
      );
      mockHistory = { ...mockHistory, status: "loading" };
      await screen.rerender(screenElement());
      await act(async () => alert.mock.calls[0][2]![1].onPress?.());
      expect(mockSave).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Gültig von").props.value).toBe("01.09.2026");
    } finally {
      alert.mockRestore();
    }
  });
  it("retains the draft and revision on a concurrent update", async () => {
    mockSave.mockRejectedValue(new ConcurrencyError("Anderer Stand gespeichert."));
    const screen = await render(screenElement());
    await choose(screen);
    await submit(screen);
    expect(screen.getByText("Anderer Stand gespeichert.")).toBeTruthy();
    expect(screen.getByLabelText("Gültig von").props.value).toBe("01.09.2026");
    expect(successFeedback).not.toHaveBeenCalled();
  });
  it("retains the draft but blocks writing during refresh failure", async () => {
    const screen = await render(screenElement());
    await choose(screen);
    for (const status of ["loading", "error"] as const) {
      mockHistory = {
        ...mockHistory,
        status,
        error: status === "error" ? "Lesen fehlgeschlagen." : null,
      };
      await screen.rerender(screenElement());
      expect(screen.getByLabelText("Gültig von").props.value).toBe("01.09.2026");
      await submit(screen);
    }
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByText("Lesen fehlgeschlagen.")).toBeTruthy();
  });
  it("removes the month only after the destructive confirmation", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockHistory = { ...mockHistory, allowanceDecisions: [existing] };
    const screen = await render(screenElement());
    await fireEvent.press(
      screen.getByRole("button", { name: "Zeitbezogene Bestätigungen entfernen" }),
    );
    expect(mockSave).not.toHaveBeenCalled();
    const actions = alert.mock.calls[0][2]!;
    expect(actions[0].style).toBe("cancel");
    await act(async () => actions[1].onPress?.());
    expect(mockSave).toHaveBeenCalledWith({ month: "2026-09", expectedRevision: 3, decisions: [] });
    expect(screen.getByText("Zeitbezogene Bestätigungen entfernt.")).toBeTruthy();
    alert.mockRestore();
  });
  it("does not turn an undated profile into a confirmed tariff", async () => {
    mockHistory = { ...mockHistory, profiles: [{ ...history(), effectiveFrom: null }] };
    const screen = await render(screenElement());
    expect(screen.queryByRole("button", { name: /Zeitraum ab/ })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Gültig von"), "01.09.2026");
    await fireEvent.changeText(screen.getByLabelText("Gültig bis"), "30.09.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Zulagenart: Keine Zulage" }));
    await submit(screen);
    expect(mockSave).not.toHaveBeenCalled();
    expect(
      screen.getByText("Für diesen Zeitraum fehlt ein berechenbarer datierter Tarif."),
    ).toBeTruthy();
  });
  it("shows initial load failures and retries without creating a confirmation", async () => {
    mockHistory = { ...mockHistory, status: "error", error: "Lesen fehlgeschlagen." };
    const screen = await render(screenElement());
    expect(screen.queryByLabelText("Gültig von")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(mockReload).toHaveBeenCalledTimes(1);
    mockHistory = { ...mockHistory, status: "ready", error: null };
    await screen.rerender(screenElement());
    expect(screen.getByLabelText("Gültig von").props.value).toBe("");
    expect(mockSave).not.toHaveBeenCalled();
  });
  it("keeps successful persistence distinct from a failed following refresh", async () => {
    const screen = await render(screenElement());
    await choose(screen);
    mockSave.mockImplementation(async () => {
      mockHistory = { ...mockHistory, status: "error", error: "Aktualisierung fehlgeschlagen." };
      return existing;
    });
    await submit(screen);
    await screen.rerender(screenElement());
    expect(screen.getByText("Zulage für den gewählten Zeitraum bestätigt.")).toBeTruthy();
    expect(screen.getByText("Aktualisierung fehlgeschlagen.")).toBeTruthy();
    await submit(screen);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(successFeedback).toHaveBeenCalledTimes(1);
  });
  it("reloads the current revision explicitly before retrying a conflicting draft", async () => {
    const screen = await render(screenElement());
    await choose(screen);
    mockSave.mockRejectedValueOnce(new ConcurrencyError());
    await submit(screen);
    mockReload.mockImplementation(async () => {
      mockHistory = { ...mockHistory, allowanceDecisions: [existing] };
    });
    await fireEvent.press(screen.getByRole("button", { name: "Aktuellen Stand neu laden" }));
    await screen.rerender(screenElement());
    expect(screen.getByLabelText("Gültig von").props.value).toBe("");
    await choose(screen);
    await submit(screen);
    expect(mockSave.mock.calls[1][0].expectedRevision).toBe(3);
  });
  it("resets the draft on month navigation and follows palette changes without line truncation", async () => {
    const screen = await render(screenElement());
    await choose(screen);
    mockPalette = DARK_PALETTE;
    await screen.rerender(screenElement("2026-10"));
    expect(screen.getByLabelText("Gültig von").props.value).toBe("");
    const text = screen.getByText(/Deine Festlegung gilt/);
    expect(StyleSheet.flatten(text.props.style).color).toBe(DARK_PALETTE.text);
    expect(text.props.numberOfLines).toBeUndefined();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
