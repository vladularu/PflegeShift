import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { router } from "expo-router";
import type { useRemunerationHistory } from "@/application/remuneration-provider";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type {
  CalendarEntry,
  MonthlyTariffDecision,
  TvoedWorkPatternSettings,
} from "@/domain/types";
import { history, resolver, shift, work as mockWork } from "@/engine/remuneration-test-fixtures";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { TariffAssessmentScreen } from "./tariff-assessment-screen";

let mockHistory: ReturnType<typeof useRemunerationHistory>;
let mockEntries: readonly CalendarEntry[];
let mockSettings: TvoedWorkPatternSettings;
let mockLegacy: readonly MonthlyTariffDecision[];
let mockMonth = "2026-09";
let mockResolver = resolver();
let mockPalette = LIGHT_PALETTE;
const mockUpdate =
  jest.fn<
    (value: Pick<TvoedWorkPatternSettings, "workplaceCoverage" | "assignment">) => Promise<void>
  >();
const mockReload = jest.fn<() => Promise<void>>();
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ month: mockMonth }),
}));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationHistory: () => mockHistory,
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockResolver }),
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
  // Deliberately different from the dated BT-K profile.
  usePflegeShiftProfile: () => ({
    profile: { ...mockWork, tariff: { ...mockWork.tariff!, payGroup: "P9", sector: "BT_B" } },
  }),
  usePflegeShiftStatus: () => ({ ready: true, error: null }),
  usePflegeShiftTariff: () => ({
    tariffDecisions: mockLegacy,
    workPatternSettings: mockSettings,
    updateWorkPatternSettings: mockUpdate,
  }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn(), selectionFeedback: jest.fn() }));
function own(date: string): DatedRemunerationProfile {
  return {
    ...history(date),
    data: {
      version: 1,
      weeklyMinutes: 2310,
      selection: { kind: "own-monthly", monthlyGrossCents: 350000 },
    },
  };
}
function confirmNone(from = "2026-09-01", through = "2026-09-30") {
  mockHistory = {
    ...mockHistory,
    allowanceDecisions: [
      {
        month: "2026-09",
        revision: 1,
        updatedAt: mockWork.updatedAt,
        decisions: [
          {
            from,
            through,
            tariff: { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" },
            allowanceStatus: "NONE",
            revision: 1,
            confirmedAt: mockWork.updatedAt,
            updatedAt: mockWork.updatedAt,
          },
        ],
      },
    ],
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockMonth = "2026-09";
  mockResolver = resolver();
  mockPalette = LIGHT_PALETTE;
  mockSettings = {
    workplaceCoverage: "AROUND_THE_CLOCK",
    assignment: "PERMANENT",
    updatedAt: mockWork.updatedAt,
  };
  mockLegacy = [];
  mockEntries = ["02", "23", "24"].map((day) =>
    shift({ id: day, date: "2026-09-" + day, startTime: "21:00", endTime: "07:00" }),
  );
  mockUpdate.mockResolvedValue(undefined);
  mockReload.mockResolvedValue(undefined);
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [history()],
    allowanceDecisions: [],
    reload: mockReload,
    saveProfile: jest.fn<ReturnType<typeof useRemunerationHistory>["saveProfile"]>(),
    saveAllowanceDecisions:
      jest.fn<ReturnType<typeof useRemunerationHistory>["saveAllowanceDecisions"]>(),
  };
});
describe("dated allowance explanations in the real screen", () => {
  it("uses the dated tariff and its engine explanation instead of the legacy profile", async () => {
    const screen = await render(<TariffAssessmentScreen />);
    expect(screen.getByText("tvoed-vka-bt-k · BT_K · OTHER")).toBeTruthy();
    expect(screen.getByText("Regelpaket: tvoed-vka-bt-k · 2026-05-r3")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Einschätzung erklären" }));
    expect(screen.getByText("Passende Nachtdienstfolge gefunden")).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockHistory.saveAllowanceDecisions).not.toHaveBeenCalled();
  });
  it("keeps a tariff-bound confirmation distinct from the automatic night evidence", async () => {
    confirmNone();
    const screen = await render(<TariffAssessmentScreen />);
    expect(screen.getByText("Tarifgebunden bestätigt")).toBeTruthy();
    expect(screen.getAllByText("Keine Zulage").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: "Einschätzung erklären" }));
    expect(screen.getByText("Passende Nachtdienstfolge gefunden")).toBeTruthy();
    expect(screen.getByText(/unabhängig davon das automatisch erkannte Dienstmuster/)).toBeTruthy();
  });
  it("does not apply an unbound legacy confirmation as the displayed entitlement", async () => {
    mockLegacy = [
      {
        month: "2026-09",
        allowanceStatus: "NONE",
        revision: 1,
        confirmedAt: mockWork.updatedAt,
        updatedAt: mockWork.updatedAt,
      },
    ];
    const screen = await render(<TariffAssessmentScreen />);
    expect(screen.getByText(/bisherige Monatsbestätigung hat keine Tarifzuordnung/)).toBeTruthy();
    expect(screen.queryByText("Tarifgebunden bestätigt")).toBeNull();
    expect(screen.queryByText("Keine Zulage")).toBeNull();
  });
  it("explains each dated segment without borrowing nights from an earlier own-pay period", async () => {
    mockHistory = { ...mockHistory, profiles: [own("2026-01-01"), history("2026-09-16")] };
    const screen = await render(<TariffAssessmentScreen />);
    expect(screen.getByText("01.09.2026 – 15.09.2026")).toBeTruthy();
    expect(screen.getByText("16.09.2026 – 30.09.2026")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Einschätzung erklären, 16.09.2026 – 30.09.2026" }),
    );
    expect(screen.queryByText("Passende Nachtdienstfolge gefunden")).toBeNull();
    expect(screen.getByText("Noch keine passende Nachtdienstfolge erkennbar")).toBeTruthy();
    expect(screen.getByText("Beobachteter Zeitraum: 16.09.2026 – 30.09.2026")).toBeTruthy();
  });
  it("shows partial confirmations only on their exact days", async () => {
    confirmNone("2026-09-10", "2026-09-20");
    const screen = await render(<TariffAssessmentScreen />);
    expect(screen.getByText("01.09.2026 – 09.09.2026")).toBeTruthy();
    expect(screen.getByText("10.09.2026 – 20.09.2026")).toBeTruthy();
    expect(screen.getByText("21.09.2026 – 30.09.2026")).toBeTruthy();
    expect(screen.getAllByText("Tarifgebunden bestätigt")).toHaveLength(1);
  });
  it("does not attach BT-K night evidence to a dated BT-B selection", async () => {
    const p = history();
    if (p.data.selection.kind !== "tariff") throw new Error("fixture");
    mockHistory = {
      ...mockHistory,
      profiles: [
        { ...p, data: { ...p.data, selection: { ...p.data.selection, variant: "BT_B" } } },
      ],
    };
    const screen = await render(<TariffAssessmentScreen />);
    expect(screen.queryByRole("button", { name: "Einschätzung erklären" })).toBeNull();
    expect(screen.getByText("tvoed-vka-bt-k · BT_B · OTHER")).toBeTruthy();
  });
  it("labels unsaved changes as a preview without persisting profile or confirmations", async () => {
    const screen = await render(<TariffAssessmentScreen />);
    await fireEvent.press(
      screen.getByRole("radio", {
        name: "Gehört das Schichtmodell dauerhaft zu deiner Stelle?: Gelegentlich",
      }),
    );
    expect(screen.getByText(/Vorschau · ungespeicherte Arbeitsplatzangaben/)).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
    expect(mockHistory.saveAllowanceDecisions).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Angaben speichern" }));
    expect(mockUpdate).toHaveBeenCalledWith({
      workplaceCoverage: "AROUND_THE_CLOCK",
      assignment: "TEMPORARY",
    });
  });
  it("keeps a failed save editable and does not navigate away", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("failed"));
    const screen = await render(<TariffAssessmentScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Angaben speichern" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Angaben konnten nicht gespeichert werden.")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
  it("prevents duplicate settings writes", async () => {
    let finish!: () => void;
    mockUpdate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const screen = await render(<TariffAssessmentScreen />);
    const button = screen.getByRole("button", { name: "Angaben speichern" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });
  it.each(["loading", "error"] as const)("hides stale explanations during %s", async (status) => {
    const screen = await render(<TariffAssessmentScreen />);
    mockHistory = { ...mockHistory, status, error: status === "error" ? "Lesefehler" : null };
    await screen.rerender(<TariffAssessmentScreen />);
    expect(screen.queryByText(/Regelpaket:/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Einschätzung erklären" })).toBeNull();
    if (status === "error") {
      await fireEvent.press(screen.getByRole("button", { name: /Erneut/ }));
      expect(mockReload).toHaveBeenCalledTimes(1);
    }
  });
  it("refreshes missing catalogs without falling back to the old profile", async () => {
    const screen = await render(<TariffAssessmentScreen />);
    mockResolver = resolver([]);
    await screen.rerender(<TariffAssessmentScreen />);
    expect(screen.getByText("Nicht verfügbar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Einschätzung erklären" })).toBeNull();
    expect(screen.queryByText(/Regelpaket:/)).toBeNull();
  });
  it("closes prior-month explanations and keeps theme text readable", async () => {
    const screen = await render(<TariffAssessmentScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Einschätzung erklären" }));
    mockMonth = "2026-10";
    mockPalette = DARK_PALETTE;
    await screen.rerender(<TariffAssessmentScreen />);
    expect(
      screen.getByRole("button", { name: "Einschätzung erklären", expanded: false }),
    ).toBeTruthy();
    const label = screen.getByText("01.10.2026 – 31.10.2026");
    expect(StyleSheet.flatten(label.props.style).color).toBe(DARK_PALETTE.text);
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.allowFontScaling).not.toBe(false);
  });
});
