import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActionSheetIOS } from "react-native";
import type { PropsWithChildren } from "react";
import type { useRemunerationData } from "@/application/remuneration-provider";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import { tvlSaturday, tvlProfile, tvlFact, tvlRules } from "@/engine/tvl-shift-work-test-fixtures";
import { work, resolver } from "@/engine/remuneration-test-fixtures";
import tvalValue from "../../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { calculateDatedMonthlyRemuneration } from "@/engine/remuneration-month";
import { LIGHT_PALETTE, DARK_PALETTE } from "@/theme/palette-values";
import { TvlShiftWorkScreen } from "./tvl-shift-work-screen";

let mockMonth: string | undefined;
let mockHistory: ReturnType<typeof useRemunerationData>;
let mockEntries = [tvlSaturday];
let mockProfile = work;
let mockPalette = LIGHT_PALETTE;
const mockReload = jest.fn(async () => {});
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ month: mockMonth }),
}));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => mockHistory,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
  usePflegeShiftProfile: () => ({ profile: mockProfile }),
  usePflegeShiftStatus: () => ({ ready: true, error: null, reload: mockReload }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));
function TestContext({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { width: 430, height: 932, x: 0, y: 0 },
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
      }}
    >
      {children}
    </SafeAreaProvider>
  );
}
const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected write");
};
beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  jest.clearAllMocks();
  mockMonth = "2026-09";
  mockEntries = [tvlSaturday];
  mockProfile = work;
  mockPalette = LIGHT_PALETTE;
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [tvlProfile()],
    tvlShiftWork: [],
    caritasMonthFacts: [],
    tvoedAnnexAMonthConfirmations: [],
    drkEmployeeMonthConfirmations: [],
    drkTrainingMonthConfirmations: [],
    tvoedAnnexAPremiumFacts: [],
    tvoedSueMonthConfirmations: [],
    tvoedSueAllowanceConfirmations: [],
    allowanceDecisions: [],
    overtimeAllocations: [],
    paidAbsences: [],
    actualAnnualPayments: [],
    tariffAnnualClaims: [],
    saveTvlShiftWork: jest
      .fn<ReturnType<typeof useRemunerationData>["saveTvlShiftWork"]>()
      .mockImplementation(async (input) => {
        const saved = {
          ...tvlFact(input.shiftWork, mockEntries[0], mockHistory.profiles[0]),
          revision: input.expectedRevision + 1,
          ...(input.burnCareIntervals === undefined
            ? {}
            : { burnCareIntervals: input.burnCareIntervals }),
        };
        mockHistory = { ...mockHistory, tvlShiftWork: [saved] };
        return saved;
      }),
    saveCaritasMonthFacts: unexpected,
    saveTvoedAnnexAMonthConfirmation: unexpected,
    saveDrkEmployeeMonthConfirmation: unexpected,
    saveDrkTrainingMonthConfirmation: unexpected,
    saveTvoedAnnexAPremiumFacts: unexpected,
    saveTvoedSueMonthConfirmation: unexpected,
    saveTvoedSueAllowanceConfirmation: unexpected,
    saveProfile: unexpected,
    saveAllowanceDecisions: unexpected,
    saveOvertimeAllocation: unexpected,
    savePaidAbsence: unexpected,
    saveActualAnnualPayment: unexpected,
    revokeActualAnnualPayment: unexpected,
    saveTariffAnnualClaim: unexpected,
    revokeTariffAnnualClaim: unexpected,
    reload: mockReload,
  };
});
async function open() {
  const screen = await render(<TvlShiftWorkScreen />, { wrapper: TestContext });
  await fireEvent.press(screen.getByRole("button", { name: /19.09.2026.*Nacht/ }));
  return screen;
}
async function choose(
  screen: Awaited<ReturnType<typeof open>>,
  label: string,
  field = /^Schicht- oder Wechselschichtarbeit/,
) {
  await fireEvent.press(screen.getByRole("button", { name: field }));
  const [options, select] = jest
    .mocked(ActionSheetIOS.showActionSheetWithOptions)
    .mock.calls.at(-1)!;
  const index = options.options.indexOf(label);
  expect(index).toBeGreaterThanOrEqual(0);
  await act(async () => {
    select(index);
  });
}
describe("TV-L service confirmation UI", () => {
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "confirms TVA-L Saturday and actual care independently with training rates",
    async (palette) => {
      mockPalette = palette;
      const old = tvlProfile();
      mockHistory = {
        ...mockHistory,
        profiles: [
          {
            ...old,
            data: {
              version: 8,
              weeklyMinutes: 2310,
              selection: {
                kind: "tariff",
                packageId: "tval-pflege-tdl",
                variant: "CARE",
                region: "WEST_38_5",
                group: "regular",
                level: "1",
                fullTimeWeeklyMinutes: 2310,
                tvalEmployerScope: "SECTION_43",
                tvlEmploymentCategory: "SALARIED_SECTION_38_5_1",
                tvalCareAllowances: { paidEntitlement: true, clinical: "HIGHER", burnCare: true },
              },
            },
          },
        ],
      };
      const screen = await open();
      expect(screen.getByText("Schwerbrandpflegezeiten")).toBeTruthy();
      const amount = () =>
        calculateDatedMonthlyRemuneration({
          month: "2026-09",
          shifts: mockEntries,
          workProfile: work,
          history: mockHistory.profiles,
          allowanceEntitlements: [],
          tvlShiftWork: mockHistory.tvlShiftWork,
          resolver: resolver([tvalValue as RuleTariffPackage]),
        }).timePremiums.totalCents;
      expect(amount()).toBeNull();
      await choose(screen, "Tatsächliche Zeiten erfassen", /^Tätigkeitszeiten/);
      await fireEvent.changeText(
        screen.getByLabelText("Abschnitt 1: Beginn ab Dienststart (Minuten)"),
        "0",
      );
      await fireEvent.changeText(
        screen.getByLabelText("Abschnitt 1: Ende ab Dienststart (Minuten)"),
        "60",
      );
      await choose(screen, "Ja");
      await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
      expect(mockHistory.saveTvlShiftWork).toHaveBeenCalledTimes(1);
      expect(amount()).toBe(64); // fixture contains one hour
      expect(mockHistory.tvlShiftWork[0].burnCareIntervals).toEqual([{ from: 0, until: 60 }]);
      const care = calculateDatedMonthlyRemuneration({
        month: "2026-09",
        shifts: mockEntries,
        workProfile: work,
        history: mockHistory.profiles,
        allowanceEntitlements: [],
        tvlShiftWork: mockHistory.tvlShiftWork,
        resolver: resolver([tvalValue as RuleTariffPackage]),
      }).allowances;
      expect(
        care.positions.find((p) => p.basis.ruleId === "tval-part-iv:burn-month-full-hours")
          ?.amountCents,
      ).toBe(93);
      expect(
        care.positions.find((p) => p.basis.ruleId === "tval-part-iv:burn-month-offset")
          ?.amountCents,
      ).toBe(-93);
      await screen.rerender(<TvlShiftWorkScreen />);
      await choose(screen, "Ungeklärt");
      await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
      expect(mockHistory.saveTvlShiftWork).toHaveBeenCalledTimes(2);
      expect(amount()).toBeNull();
      await screen.unmount();
    },
  );
  function enableBurnCare() {
    const profile = tvlProfile();
    if (profile.data.selection.kind !== "tariff") throw Error("fixture");
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...profile,
          data: {
            ...profile.data,
            version: 5,
            selection: {
              ...profile.data.selection,
              tvlCareAllowances: {
                paidEntitlement: true,
                nursing: false,
                instructor: false,
                leadershipAnnexFNumber: "NONE",
                clinical: "DIRECT_HIGHER",
                burnCare: true,
                functionDuty: "NONE",
              },
            },
          },
        },
      ],
    };
  }
  function burnAmounts() {
    const result = calculateDatedMonthlyRemuneration({
      month: "2026-09",
      shifts: mockEntries,
      workProfile: work,
      history: mockHistory.profiles,
      allowanceEntitlements: [],
      tvlShiftWork: mockHistory.tvlShiftWork,
      resolver: tvlRules,
    });
    return result.allowances.positions
      .filter((p) => p.id.startsWith("tvl-care:burn:"))
      .map((p) => p.amountCents);
  }
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves, reopens and revokes actual care independently of Saturday in theme %#",
    async (palette) => {
      mockPalette = palette;
      enableBurnCare();
      const screen = await open();
      await choose(screen, "Tatsächliche Zeiten erfassen", /^Tätigkeitszeiten/);
      await fireEvent.changeText(
        screen.getByLabelText("Abschnitt 1: Beginn ab Dienststart (Minuten)"),
        "0",
      );
      await fireEvent.changeText(
        screen.getByLabelText("Abschnitt 1: Ende ab Dienststart (Minuten)"),
        "60",
      );
      expect(screen.getByText(/19.09.2026 13:00.*19.09.2026 14:00.*60 Minuten/)).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
      expect(mockHistory.saveTvlShiftWork).toHaveBeenLastCalledWith(
        expect.objectContaining({
          shiftWork: null,
          burnCareIntervals: [{ from: 0, until: 60 }],
        }),
      );
      expect(burnAmounts()).toEqual([186]);
      await fireEvent.press(screen.getByRole("button", { name: "Zurück zur Dienstauswahl" }));
      await fireEvent.press(
        screen.getByRole("button", { name: /Schwerbrandpflege: Zeiten erfasst/ }),
      );
      expect(screen.getByLabelText("Abschnitt 1: Ende ab Dienststart (Minuten)").props.value).toBe(
        "60",
      );
      await choose(screen, "Noch ungeklärt", /^Tätigkeitszeiten/);
      await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
      expect(mockHistory.tvlShiftWork[0].burnCareIntervals).toBeNull();
      expect(burnAmounts()).toEqual([null]);
      await choose(screen, "Keine Tätigkeit in diesem Dienstzeitraum", /^Tätigkeitszeiten/);
      await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
      expect(mockHistory.tvlShiftWork[0].burnCareIntervals).toEqual([]);
      expect(burnAmounts()).toEqual([0]);
    },
  );
  it.each(["abc", "90"])(
    "rejects malformed/out-of-service actual minutes %s without writing",
    async (end) => {
      enableBurnCare();
      const screen = await open();
      await choose(screen, "Tatsächliche Zeiten erfassen", /^Tätigkeitszeiten/);
      await fireEvent.changeText(
        screen.getByLabelText("Abschnitt 1: Beginn ab Dienststart (Minuten)"),
        "0",
      );
      await fireEvent.changeText(
        screen.getByLabelText("Abschnitt 1: Ende ab Dienststart (Minuten)"),
        end,
      );
      await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
      expect(mockHistory.saveTvlShiftWork).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Abschnitt 1: Ende ab Dienststart (Minuten)").props.value).toBe(
        end,
      );
    },
  );
  it("keeps actual care draft after a failed write and does not preload stale care", async () => {
    enableBurnCare();
    mockHistory = {
      ...mockHistory,
      tvlShiftWork: [
        {
          ...tvlFact(null, mockEntries[0], mockHistory.profiles[0]),
          shiftRevision: 99,
          burnCareIntervals: [{ from: 0, until: 60 }],
        },
      ],
    };
    jest.mocked(mockHistory.saveTvlShiftWork).mockRejectedValue(new Error("database failure"));
    const screen = await open();
    expect(screen.getByRole("button", { name: /Tätigkeitszeiten.*Noch ungeklärt/ })).toBeTruthy();
    expect(screen.queryByLabelText("Abschnitt 1: Ende ab Dienststart (Minuten)")).toBeNull();
    await choose(screen, "Tatsächliche Zeiten erfassen", /^Tätigkeitszeiten/);
    await fireEvent.changeText(
      screen.getByLabelText("Abschnitt 1: Beginn ab Dienststart (Minuten)"),
      "0",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Abschnitt 1: Ende ab Dienststart (Minuten)"),
      "60",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
    expect(screen.getByText(/Speichern fehlgeschlagen/)).toBeTruthy();
    expect(screen.getByLabelText("Abschnitt 1: Ende ab Dienststart (Minuten)").props.value).toBe(
      "60",
    );
  });
  it.each(["2026-13", undefined])("rejects invalid month %s", async (month) => {
    mockMonth = month;
    const screen = await render(<TvlShiftWorkScreen />, { wrapper: TestContext });
    expect(screen.getByText("Der Link enthält keinen gültigen Monat.")).toBeTruthy();
    expect(mockHistory.saveTvlShiftWork).not.toHaveBeenCalled();
  });
  it("distinguishes loading, failure and a truly empty list", async () => {
    mockHistory = { ...mockHistory, status: "loading" };
    const screen = await render(<TvlShiftWorkScreen />, { wrapper: TestContext });
    expect(screen.queryByTestId("tvl-shift-work-list")).toBeNull();
    mockHistory = { ...mockHistory, status: "error", error: "Lesefehler" };
    await screen.rerender(<TvlShiftWorkScreen />);
    expect(screen.getByText("Lesefehler")).toBeTruthy();
    mockHistory = { ...mockHistory, status: "ready", error: null, profiles: [] };
    await screen.rerender(<TvlShiftWorkScreen />);
    expect(screen.getByText(/Keine zeitgebundenen TV-L-\/TVA-L-Dienste/)).toBeTruthy();
  });
  it("saves yes, no and revocation through to the real monthly engine", async () => {
    const screen = await open();
    for (const [label, value, cents] of [
      ["Ja", true, 64],
      ["Nein", false, 380],
      ["Ungeklärt", null, null],
    ] as const) {
      await choose(screen, label);
      await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
      expect(mockHistory.saveTvlShiftWork).toHaveBeenLastCalledWith(
        expect.objectContaining({
          shiftId: tvlSaturday.id,
          expectedShiftRevision: 1,
          expectedShiftUpdatedAt: tvlSaturday.updatedAt,
          profileEffectiveFrom: "2026-04-01",
          expectedProfileRevision: 1,
          shiftWork: value,
        }),
      );
      const result = calculateDatedMonthlyRemuneration({
        month: "2026-09",
        shifts: mockEntries,
        workProfile: work,
        history: mockHistory.profiles,
        allowanceEntitlements: [],
        tvlShiftWork: mockHistory.tvlShiftWork,
        resolver: tvlRules,
      });
      expect(result.timePremiums.totalCents).toBe(cents);
    }
    expect(mockHistory.tvlShiftWork[0].revision).toBe(3);
    expect(
      screen.getByText("Angabe aufgehoben. Der Schichtarbeitsbezug ist ungeklärt."),
    ).toBeTruthy();
  });
  it.each(["shift", "profile", "timezone", "restore"])(
    "blocks a form after %s changes until reload",
    async (kind) => {
      const screen = await open();
      await choose(screen, "Ja");
      if (kind === "shift") mockEntries = [{ ...tvlSaturday, revision: 2 }];
      if (kind === "profile")
        mockHistory = { ...mockHistory, profiles: [{ ...tvlProfile(), revision: 2 }] };
      if (kind === "timezone") mockProfile = { ...work, timeZone: "Europe/Paris" };
      if (kind === "restore") mockHistory = { ...mockHistory, tvlShiftWork: [tvlFact(false)] };
      await screen.rerender(<TvlShiftWorkScreen />);
      expect(
        screen.getByRole("button", { name: "Angabe speichern" }).props.accessibilityState.disabled,
      ).toBe(true);
      await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
      expect(mockHistory.saveTvlShiftWork).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByRole("button", { name: "Aktuellen Stand laden" }));
      expect(mockReload).toHaveBeenCalled();
    },
  );
  it("does not reuse a stale prior answer when the editor is reopened", async () => {
    mockHistory = { ...mockHistory, tvlShiftWork: [{ ...tvlFact(true), shiftRevision: 99 }] };
    const screen = await open();
    expect(
      screen.getByRole("button", { name: /Schicht- oder Wechselschichtarbeit.*Ungeklärt/ }),
    ).toBeTruthy();
  });
  it("preserves the selection on write failure", async () => {
    jest.mocked(mockHistory.saveTvlShiftWork).mockRejectedValue(new Error("database failure"));
    const screen = await open();
    await choose(screen, "Nein");
    await fireEvent.press(screen.getByRole("button", { name: "Angabe speichern" }));
    expect(screen.getByText(/Speichern fehlgeschlagen/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Schicht- oder Wechselschichtarbeit.*Nein/ }),
    ).toBeTruthy();
  });
  it("prevents duplicate saves while the first write is pending", async () => {
    let resolve!: (value: SavedTvlShiftWork) => void;
    const pending = new Promise<SavedTvlShiftWork>((yes) => {
      resolve = yes;
    });
    jest.mocked(mockHistory.saveTvlShiftWork).mockReturnValue(pending);
    const screen = await open();
    await choose(screen, "Ja");
    const button = screen.getByRole("button", { name: "Angabe speichern" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockHistory.saveTvlShiftWork).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(tvlFact(true));
      await pending;
    });
  });
  it("uses theme colors and no single-line truncation for form explanations", async () => {
    const screen = await open();
    mockPalette = DARK_PALETTE;
    await screen.rerender(<TvlShiftWorkScreen />);
    const explanation = screen.getByText(/Maßgeblich ist die tarifliche Einordnung/);
    expect(explanation.props.style.color).toBe(DARK_PALETTE.text);
    expect(explanation.props.numberOfLines).toBeUndefined();
    expect(explanation.props.maxFontSizeMultiplier).toBe(0);
  });
});
