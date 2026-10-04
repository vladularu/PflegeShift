import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ActionSheetIOS, Alert, Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { PropsWithChildren } from "react";
import { router } from "expo-router";
import type { useRemunerationData } from "@/application/remuneration-provider";
import type { UserProfile } from "@/domain/types";
import type { SavedActualOwnAnnualPayment } from "@/domain/saved-annual-payment";
import { activeActualOwnAnnualPayments } from "@/domain/saved-annual-payment";
import { ConcurrencyError } from "@/domain/errors";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import { history, work, resolver } from "@/engine/remuneration-test-fixtures";
import { calculateOwnAnnualPayments } from "@/engine/remuneration-annual-payment";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { AnnualPaymentScreen } from "./annual-payment-screen";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { calculateTariffAnnualClaim } from "@/engine/tariff-annual-payment";
import tvlRaw from "../../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";

let mockMonth: string | string[] | undefined;
let mockHistory: ReturnType<typeof useRemunerationData>;
let mockProfile: UserProfile | null;
let mockReady: boolean;
let mockError: string | null;
let mockTestMonths: readonly string[];
let mockPalette = LIGHT_PALETTE;
const mockReload = jest.fn<() => Promise<void>>();
const record: SavedActualOwnAnnualPayment = {
  payment: {
    version: 1,
    revision: 1,
    paymentId: "annual",
    entitlementYear: 2026,
    payoutMonth: "2026-11",
    title: "Jahressonderzahlung",
    grossCents: 54321,
  },
  revoked: false,
  updatedAt: work.updatedAt,
};
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
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ month: mockMonth }),
}));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => mockHistory,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({ profile: mockProfile }),
  usePflegeShiftStatus: () => ({ ready: mockReady, error: mockError, reload: mockReload }),
  usePflegeShiftTestData: () => ({ testMonths: mockTestMonths }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 430, height: 932, scale: 3, fontScale: 3.12 }),
}));
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockMonth = "2026-11";
  mockProfile = work;
  mockReady = true;
  mockError = null;
  mockTestMonths = [];
  mockPalette = LIGHT_PALETTE;
  mockReload.mockResolvedValue(undefined);
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [
      {
        ...history(),
        data: {
          version: 2,
          weeklyMinutes: 1155,
          selection: { kind: "own-configured", configuration: ownRemunerationFixture() },
        },
      },
    ],
    allowanceDecisions: [],
    overtimeAllocations: [],
    paidAbsences: [],
    actualAnnualPayments: [],
    tariffAnnualClaims: [],
    tvlShiftWork: [],
    caritasMonthFacts: [],
    tvoedAnnexAMonthConfirmations: [],
    drkEmployeeMonthConfirmations: [],
    drkTrainingMonthConfirmations: [],
    tvoedAnnexAPremiumFacts: [],
    tvoedSueMonthConfirmations: [],
    tvoedSueAllowanceConfirmations: [],
    saveTvlShiftWork: jest.fn<ReturnType<typeof useRemunerationData>["saveTvlShiftWork"]>(),
    saveTvoedAnnexAMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedAnnexAMonthConfirmation"]>(),
    saveDrkEmployeeMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveDrkEmployeeMonthConfirmation"]>(),
    saveDrkTrainingMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveDrkTrainingMonthConfirmation"]>(),
    saveTvoedAnnexAPremiumFacts:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedAnnexAPremiumFacts"]>(),
    saveTvoedSueMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedSueMonthConfirmation"]>(),
    saveTvoedSueAllowanceConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedSueAllowanceConfirmation"]>(),
    saveCaritasMonthFacts:
      jest.fn<ReturnType<typeof useRemunerationData>["saveCaritasMonthFacts"]>(),
    saveTariffAnnualClaim:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTariffAnnualClaim"]>(),
    revokeTariffAnnualClaim:
      jest.fn<ReturnType<typeof useRemunerationData>["revokeTariffAnnualClaim"]>(),
    reload: mockReload,
    saveProfile: jest.fn<ReturnType<typeof useRemunerationData>["saveProfile"]>(),
    saveAllowanceDecisions:
      jest.fn<ReturnType<typeof useRemunerationData>["saveAllowanceDecisions"]>(),
    saveOvertimeAllocation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveOvertimeAllocation"]>(),
    savePaidAbsence: jest.fn<ReturnType<typeof useRemunerationData>["savePaidAbsence"]>(),
    saveActualAnnualPayment: jest
      .fn<ReturnType<typeof useRemunerationData>["saveActualAnnualPayment"]>()
      .mockImplementation(async (input) => {
        const saved: SavedActualOwnAnnualPayment = {
          payment: {
            ...input.payment,
            version: 1,
            revision: (input.expected?.payment.revision ?? 0) + 1,
          },
          revoked: false,
          updatedAt: work.updatedAt,
        };
        mockHistory = { ...mockHistory, actualAnnualPayments: [saved] };
        return saved;
      }),
    revokeActualAnnualPayment: jest
      .fn<ReturnType<typeof useRemunerationData>["revokeActualAnnualPayment"]>()
      .mockImplementation(async (expected) => {
        const saved = {
          ...expected,
          payment: { ...expected.payment, revision: expected.payment.revision + 1 },
          revoked: true,
        };
        mockHistory = { ...mockHistory, actualAnnualPayments: [saved] };
        return saved;
      }),
  };
});
async function open() {
  const view = await render(<AnnualPaymentScreen />, { wrapper: TestContext });
  await fireEvent.press(view.getByRole("button", { name: /^Jahressonderzahlung ·/ }));
  return view;
}

async function choose(view: Awaited<ReturnType<typeof render>>, label: string, option: string) {
  const sheet = jest
    .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
    .mockImplementation(() => {});
  await fireEvent.press(view.getByRole("button", { name: new RegExp(`^${label}:`) }));
  const call = sheet.mock.calls[sheet.mock.calls.length - 1];
  expect(call[0].options).toContain(option);
  await act(async () => call[1](call[0].options.indexOf(option)));
}
describe("own actual annual payment input", () => {
  it.each([undefined, "2026-13", ["2026-11", "2027-01"]])(
    "rejects an invalid month link %s",
    async (month) => {
      mockMonth = month;
      const view = await render(<AnnualPaymentScreen />, { wrapper: TestContext });
      expect(view.getByText("Der Link enthält keinen gültigen Monat.")).toBeTruthy();
      await fireEvent.press(view.getByRole("button", { name: "Schließen" }));
      expect(router.back).toHaveBeenCalled();
      expect(mockHistory.saveActualAnnualPayment).not.toHaveBeenCalled();
    },
  );
  it("distinguishes loading, failed loading and a missing personal profile", async () => {
    mockHistory = { ...mockHistory, status: "loading" };
    const view = await render(<AnnualPaymentScreen />, { wrapper: TestContext });
    expect(view.queryByTestId("annual-payment-list")).toBeNull();
    mockHistory = { ...mockHistory, status: "error", error: "Lesefehler" };
    await view.rerender(<AnnualPaymentScreen />);
    expect(view.getByText("Lesefehler")).toBeTruthy();
    mockHistory = { ...mockHistory, status: "ready", error: null };
    mockProfile = null;
    await view.rerender(<AnnualPaymentScreen />);
    expect(view.getByText("Bitte zuerst ein Arbeitszeitmodell einrichten.")).toBeTruthy();
  });
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "requires an explicit amount and connects it to the real engine without extra part-time reduction",
    async (palette) => {
      mockPalette = palette;
      const dismiss = jest.spyOn(Keyboard, "dismiss");
      const view = await open();
      expect(view.getByLabelText("Tatsächlicher Bruttobetrag in Euro").props.value).toBe("");
      await fireEvent.press(view.getByRole("button", { name: "Tatsächliche Zahlung bestätigen" }));
      expect(mockHistory.saveActualAnnualPayment).not.toHaveBeenCalled();
      await fireEvent.changeText(
        view.getByLabelText("Tatsächlicher Bruttobetrag in Euro"),
        "1250,01",
      );
      await fireEvent.changeText(view.getByLabelText("Auszahlungsmonat (MM.JJJJ)"), "01.2027");
      await fireEvent.press(view.getByRole("button", { name: "Tastatur schließen" }));
      expect(dismiss).toHaveBeenCalled();
      await fireEvent.press(view.getByRole("button", { name: "Tatsächliche Zahlung bestätigen" }));
      expect(mockHistory.saveActualAnnualPayment).toHaveBeenCalledWith({
        expected: null,
        payment: {
          paymentId: "annual",
          entitlementYear: 2026,
          payoutMonth: "2027-01",
          title: "Jahressonderzahlung",
          grossCents: 125001,
        },
      });
      const active = activeActualOwnAnnualPayments(mockHistory.actualAnnualPayments);
      expect(
        calculateOwnAnnualPayments("2026-11", mockHistory.profiles, active, resolver()).totalCents,
      ).toBe(0);
      expect(
        calculateOwnAnnualPayments("2027-01", mockHistory.profiles, active, resolver()).totalCents,
      ).toBe(125001);
      expect(mockHistory.saveProfile).not.toHaveBeenCalled();
      await fireEvent.press(view.getByRole("button", { name: "Zurück zur Auswahl" }));
      expect(view.getByRole("button", { name: /01.2027 bestätigt/ })).toBeTruthy();
    },
  );
  it("requires confirmation for revocation and supports re-confirming an actual zero", async () => {
    mockHistory = { ...mockHistory, actualAnnualPayments: [record] };
    const alert = jest.spyOn(Alert, "alert");
    const view = await open();
    await fireEvent.press(view.getByRole("button", { name: "Bestätigung widerrufen" }));
    expect(mockHistory.revokeActualAnnualPayment).not.toHaveBeenCalled();
    await act(async () =>
      alert.mock.calls[0][2]!.find((item) => item.style === "destructive")!.onPress?.(),
    );
    expect(mockHistory.revokeActualAnnualPayment).toHaveBeenCalledWith(record);
    expect(
      calculateOwnAnnualPayments(
        "2026-11",
        mockHistory.profiles,
        activeActualOwnAnnualPayments(mockHistory.actualAnnualPayments),
        resolver(),
      ).totalCents,
    ).toBe(75000);
    expect(view.getByText(/bisherige Wert bleibt gespeichert/)).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Tatsächlicher Bruttobetrag in Euro"), "0");
    await fireEvent.press(view.getByRole("button", { name: "Tatsächliche Zahlung bestätigen" }));
    expect(mockHistory.saveActualAnnualPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expected: expect.objectContaining({
          revoked: true,
          payment: expect.objectContaining({ revision: 2 }),
        }),
        payment: expect.objectContaining({ grossCents: 0 }),
      }),
    );
  });
  it.each(["restore", "profile", "test-lab"])(
    "keeps draft text and blocks a changed %s",
    async (change) => {
      const view = await open();
      await fireEvent.changeText(
        view.getByLabelText("Tatsächlicher Bruttobetrag in Euro"),
        "123,45",
      );
      if (change === "restore") mockHistory = { ...mockHistory, actualAnnualPayments: [record] };
      if (change === "profile") mockHistory = { ...mockHistory, profiles: [] };
      if (change === "test-lab") mockTestMonths = ["2026-09"];
      await view.rerender(<AnnualPaymentScreen />);
      expect(view.getByLabelText("Tatsächlicher Bruttobetrag in Euro").props.value).toBe("123,45");
      await fireEvent.press(view.getByRole("button", { name: "Tatsächliche Zahlung bestätigen" }));
      expect(mockHistory.saveActualAnnualPayment).not.toHaveBeenCalled();
      await fireEvent.press(view.getByRole("button", { name: "Aktuellen Stand laden" }));
      expect(mockReload).toHaveBeenCalled();
    },
  );
  it("retains draft and expected data after conflicts and hides internal errors", async () => {
    const view = await open();
    await fireEvent.changeText(view.getByLabelText("Tatsächlicher Bruttobetrag in Euro"), "123");
    jest.mocked(mockHistory.saveActualAnnualPayment).mockRejectedValueOnce(new ConcurrencyError());
    await fireEvent.press(view.getByRole("button", { name: "Tatsächliche Zahlung bestätigen" }));
    expect(view.getByText(/zwischenzeitlich geändert/)).toBeTruthy();
    jest
      .mocked(mockHistory.saveActualAnnualPayment)
      .mockRejectedValueOnce(new Error("private SQL 123"));
    await fireEvent.press(view.getByRole("button", { name: "Tatsächliche Zahlung bestätigen" }));
    expect(view.getByText(/Speichern fehlgeschlagen/)).toBeTruthy();
    expect(view.queryByText(/private SQL/)).toBeNull();
    expect(view.getByLabelText("Tatsächlicher Bruttobetrag in Euro").props.value).toBe("123");
  });
  it("prevents duplicate writes while saving", async () => {
    let finish!: (value: SavedActualOwnAnnualPayment) => void;
    jest.mocked(mockHistory.saveActualAnnualPayment).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = await open();
    await fireEvent.changeText(view.getByLabelText("Tatsächlicher Bruttobetrag in Euro"), "543,21");
    await fireEvent.press(view.getByRole("button", { name: "Tatsächliche Zahlung bestätigen" }));
    const busy = view.getByRole("button", { name: "Wird gespeichert" });
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(busy);
    expect(mockHistory.saveActualAnnualPayment).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockHistory = { ...mockHistory, actualAnnualPayments: [record] };
      finish(record);
    });
    expect(view.getByText(/Tatsächliche Bruttozahlung gespeichert/)).toBeTruthy();
  });
  it("keeps claim-year selection separate from route month and preserves removed confirmations", async () => {
    mockMonth = "2027-01";
    mockHistory = { ...mockHistory, profiles: [], actualAnnualPayments: [record] };
    const view = await render(<AnnualPaymentScreen />, { wrapper: TestContext });
    expect(view.getByText(/Keine eigenen Sonderzahlungen/)).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Anspruchsjahr"), "2026");
    await fireEvent.press(view.getByRole("button", { name: /^Jahressonderzahlung ·/ }));
    expect(view.getByText("Anspruchsjahr 2026 · Eigene Vergütung")).toBeTruthy();
    mockMonth = "2028-01";
    await view.rerender(<AnnualPaymentScreen />);
    expect(view.queryByTestId("annual-payment-form")).toBeNull();
    expect(view.getByLabelText("Anspruchsjahr").props.value).toBe("2028");
  });
  it("keeps tariff rules separate from own payments and blocks test-lab confirmations", async () => {
    mockHistory = { ...mockHistory, profiles: [history()] };
    const view = await render(<AnnualPaymentScreen />, { wrapper: TestContext });
    expect(
      view.getByText(/Tarifliche Sonderzahlungen können hier nicht überschrieben/),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Vergütungsprofil öffnen" }));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: { section: "TARIFF" } }),
    );
    mockHistory = { ...mockHistory, actualAnnualPayments: [record] };
    mockTestMonths = ["2026-09"];
    await view.rerender(<AnnualPaymentScreen />);
    await fireEvent.press(view.getByRole("button", { name: /^Jahressonderzahlung ·/ }));
    expect(view.queryByTestId("annual-payment-form")).toBeNull();
    expect(view.getByText(/Bitte zuerst alle Testlabor-Versuche/)).toBeTruthy();
  });
});

describe("tariff annual payment input", () => {
  beforeEach(() => {
    mockHistory = { ...mockHistory, profiles: [history()] };
    jest.mocked(mockHistory.saveTariffAnnualClaim).mockImplementation(async (input) => {
      const saved: SavedTariffAnnualClaim = {
        claim: input.claim,
        actualPayment: input.actualPayment,
        revoked: false,
        revision: (input.expected?.revision ?? 0) + 1,
        updatedAt: work.updatedAt,
      };
      mockHistory = { ...mockHistory, tariffAnnualClaims: [saved] };
      return saved;
    });
    jest.mocked(mockHistory.revokeTariffAnnualClaim).mockImplementation(async (expected) => {
      const saved = { ...expected, revoked: true, revision: expected.revision + 1 };
      mockHistory = { ...mockHistory, tariffAnnualClaims: [saved] };
      return saved;
    });
  });
  async function openTariff(tvl = false) {
    const view = await render(<AnnualPaymentScreen />, { wrapper: TestContext });
    await fireEvent.press(
      view.getByRole("button", { name: "Tarifliche Jahressonderzahlung bearbeiten" }),
    );
    await fireEvent.press(
      view.getByRole("button", {
        name: tvl ? /TV-L\/KR.*Angaben ergänzen/ : /TVöD-P.*Angaben ergänzen/,
      }),
    );
    return view;
  }
  it("saves and reopens the distinct Caritas September-group confirmation", async () => {
    const p = history();
    if (p.data.selection.kind !== "tariff") throw Error("expected tariff");
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...p,
          data: {
            ...p.data,
            selection: {
              ...p.data.selection,
              packageId: "avr-caritas-p-bw",
              variant: "ANLAGE_31",
              region: "BW",
              group: "P7",
            },
          },
        },
      ],
    };
    const view = await render(<AnnualPaymentScreen />, { wrapper: TestContext });
    await fireEvent.press(
      view.getByRole("button", { name: "Tarifliche Jahressonderzahlung bearbeiten" }),
    );
    await fireEvent.press(
      view.getByRole("button", { name: /AVR-Caritas Pflege.*Angaben ergänzen/ }),
    );
    await choose(view, "P-Gruppe am 1. September anhand von Unterlagen bestätigt", "Bestätigt");
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
    expect(mockHistory.tariffAnnualClaims[0].claim).toMatchObject({
      version: 3,
      selection: { group: "p7", confirmed: false, groupAtSeptember1Confirmed: true },
    });
    expect(mockHistory.tariffAnnualClaims[0].actualPayment).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Zurück zu Tarifzahlungen" }));
    expect(view.queryByRole("button", { name: /AVR-Caritas Pflege.*Angaben ergänzen/ })).toBeNull();
    await fireEvent.press(
      view.getByRole("button", { name: /AVR-Caritas Pflege.*Entwurf bearbeiten/ }),
    );
    expect(
      view.getByRole("button", {
        name: /P-Gruppe am 1. September anhand von Unterlagen bestätigt.*Bestätigt/,
      }),
    ).toBeTruthy();
  });
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves an incomplete draft and reopens it without inventing an entitlement",
    async (palette) => {
      mockPalette = palette;
      const view = await openTariff();
      await choose(view, "Abschnitt", "Beschäftigungszeitraum");
      await fireEvent.changeText(
        view.getByLabelText("Beschäftigungsbeginn (TT.MM.JJJJ)"),
        "01.04.2026",
      );
      await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
      const saved = mockHistory.tariffAnnualClaims[0];
      expect(saved.claim.selection).toMatchObject({ group: "p5", confirmed: false });
      expect(saved.claim.employment).toMatchObject({ start: "2026-04-01", confirmed: false });
      expect(saved.actualPayment).toBeNull();
      expect(saved.claim.entitlements.every((m) => m.reason === "UNKNOWN")).toBe(true);
      await fireEvent.press(view.getByRole("button", { name: "Zurück zu Tarifzahlungen" }));
      expect(view.queryByRole("button", { name: /Angaben ergänzen/ })).toBeNull();
      await fireEvent.press(view.getByRole("button", { name: /Angaben bearbeiten/ }));
      await choose(view, "Abschnitt", "Beschäftigungszeitraum");
      expect(view.getByLabelText("Beschäftigungsbeginn (TT.MM.JJJJ)").props.value).toBe(
        "01.04.2026",
      );
    },
  );
  it("confirms zero in the following payout year and reactivates a revoked record", async () => {
    const view = await openTariff();
    await choose(view, "Abschnitt", "Tatsächliche Auszahlung");
    await choose(view, "Tatsächliche Auszahlung liegt vor", "Bestätigt");
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
    expect(mockHistory.saveTariffAnnualClaim).not.toHaveBeenCalled();
    await fireEvent.changeText(
      view.getByLabelText("Tatsächlicher tariflicher Bruttobetrag in Euro"),
      "0",
    );
    await fireEvent.changeText(
      view.getByLabelText("Tariflicher Auszahlungsmonat (MM.JJJJ)"),
      "01.2027",
    );
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    await fireEvent.press(view.getByRole("button", { name: "Tastatur schließen" }));
    expect(dismiss).toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
    const saved = mockHistory.tariffAnnualClaims[0];
    expect(saved.actualPayment).toEqual({ grossCents: 0, payoutMonth: "2027-01" });
    expect(saved.claim.year).toBe(2026);
    const alert = jest.spyOn(Alert, "alert");
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben deaktivieren" }));
    expect(mockHistory.revokeTariffAnnualClaim).not.toHaveBeenCalled();
    await act(async () =>
      alert.mock.calls[0][2]!.find((item) => item.style === "destructive")!.onPress?.(),
    );
    expect(mockHistory.revokeTariffAnnualClaim).toHaveBeenCalledWith(saved);
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben erneut aktivieren" }));
    expect(mockHistory.saveTariffAnnualClaim).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expected: expect.objectContaining({ revoked: true, revision: 2 }),
        actualPayment: { grossCents: 0, payoutMonth: "2027-01" },
      }),
    );
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "assembles form inputs accepted by the real tariff calculation (TV-L %s)",
    async (tvl) => {
      if (tvl) {
        const p = history();
        if (p.data.selection.kind !== "tariff") throw Error("expected tariff");
        mockHistory = {
          ...mockHistory,
          profiles: [
            {
              ...p,
              data: {
                ...p.data,
                selection: {
                  ...p.data.selection,
                  packageId: "tvl-kr-tdl",
                  variant: "SECTION_43",
                  region: "WEST_38_5",
                  group: "KR9",
                  level: "2",
                },
              },
            },
          ],
        };
      }
      const view = await openTariff(tvl);
      await choose(view, "Tarifzuordnung für dieses Anspruchsjahr geprüft", "Bestätigt");
      await choose(view, "Abschnitt", "Beschäftigungszeitraum");
      await fireEvent.changeText(
        view.getByLabelText("Beschäftigungsbeginn (TT.MM.JJJJ)"),
        "01.01.2025",
      );
      await choose(view, "Beschäftigungszeitraum geprüft", "Bestätigt");
      await choose(view, "Abschnitt", "Anspruchsmonate");
      for (const month of [
        "Januar",
        "Februar",
        "März",
        "April",
        "Mai",
        "Juni",
        "Juli",
        "August",
        "September",
        "Oktober",
        "November",
        "Dezember",
      ])
        await choose(view, month, "Anspruch auf Entgelt / Entgeltfortzahlung");
      await choose(view, "Abschnitt", "Ausnahmen & Aufteilung");
      await choose(view, "Aufteilung des Jahresanspruchs erforderlich", "Nein");
      await choose(view, "Abschnitt", "Besondere Bemessungsgrundlagen");
      await choose(view, "Teilzeit während Elternzeit im Geburtsjahr", "Nein");
      await choose(view, "Abschnitt", "Bemessungsmonate");
      for (const month of ["07.2026", "08.2026", "09.2026"]) {
        await fireEvent.changeText(
          view.getByLabelText("Bemessungsmonat hinzufügen (MM.JJJJ)"),
          month,
        );
        await fireEvent.press(view.getByRole("button", { name: "Bemessungsmonat ergänzen" }));
        for (const [label, amount] of [
          ["Grundentgelt in Euro", "3000"],
          ["Feste Bestandteile in Euro", "0"],
          ["Variable Bestandteile in Euro", "0"],
          ["Dienstplanmäßige Überstunden in Euro", "0"],
          ["Kalendertage mit berücksichtigungsfähigem Entgelt", month === "09.2026" ? "30" : "31"],
        ])
          await fireEvent.changeText(view.getByLabelText(label), amount);
        await choose(view, "Bestandteile für diesen Monat geprüft", "Bestätigt");
      }
      await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
      const result = calculateTariffAnnualClaim(
        tvl ? (tvlRaw as RuleTariffPackage) : tariffAnnualFixture().pkg,
        mockHistory.tariffAnnualClaims[0].claim,
      );
      expect(result.status).toBe("estimated");
      expect(result.amountCents).toBe(tvl ? 223050 : 270000);
    },
  );
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "persists the TV-L exception answer in both themes",
    async (palette) => {
      mockPalette = palette;
      const p = history();
      if (p.data.selection.kind !== "tariff") throw Error("expected tariff");
      mockHistory = {
        ...mockHistory,
        profiles: [
          {
            ...p,
            data: {
              ...p.data,
              selection: {
                ...p.data.selection,
                packageId: "tvl-kr-tdl",
                variant: "SECTION_43",
                region: "WEST_38_5",
                group: "KR9",
                level: "2",
              },
            },
          },
        ],
      };
      const view = await openTariff(true);
      await choose(view, "Abschnitt", "Ausnahmen & Aufteilung");
      await choose(view, "TV-L-Altersteilzeit-Ausnahme bei Renteneintritt", "Nein");
      await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
      expect(mockHistory.tariffAnnualClaims[0].claim).toMatchObject({
        version: 2,
        exceptions: { tvlLegacyRetirementExit: false },
      });
      await fireEvent.press(view.getByRole("button", { name: "Zurück zu Tarifzahlungen" }));
      await fireEvent.press(view.getByRole("button", { name: /TV-L\/KR.*Angaben bearbeiten/ }));
      await choose(view, "Abschnitt", "Ausnahmen & Aufteilung");
      expect(
        view.getByRole("button", { name: /TV-L-Altersteilzeit-Ausnahme bei Renteneintritt.*Nein/ }),
      ).toBeTruthy();
    },
  );
  it.each(["restore", "profile", "test-lab", "loading"])(
    "retains draft and blocks changed %s",
    async (change) => {
      const view = await openTariff();
      await choose(view, "Abschnitt", "Beschäftigungszeitraum");
      await fireEvent.changeText(
        view.getByLabelText("Beschäftigungsbeginn (TT.MM.JJJJ)"),
        "01.04.2026",
      );
      if (change === "restore")
        mockHistory = {
          ...mockHistory,
          tariffAnnualClaims: [
            {
              claim: { ...tariffAnnualFixture().claim, id: "tariff-annual-1" },
              actualPayment: null,
              revoked: false,
              revision: 1,
              updatedAt: work.updatedAt,
            },
          ],
        };
      if (change === "profile") mockHistory = { ...mockHistory, profiles: [] };
      if (change === "test-lab") mockTestMonths = ["2026-09"];
      if (change === "loading") mockHistory = { ...mockHistory, status: "loading" };
      await view.rerender(<AnnualPaymentScreen />);
      expect(view.getByLabelText("Beschäftigungsbeginn (TT.MM.JJJJ)").props.value).toBe(
        "01.04.2026",
      );
      await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
      expect(mockHistory.saveTariffAnnualClaim).not.toHaveBeenCalled();
      await fireEvent.press(view.getByRole("button", { name: "Aktuellen Stand laden" }));
      expect(mockReload).toHaveBeenCalled();
    },
  );
  it("retains input after conflict and conceals internal database errors", async () => {
    const view = await openTariff();
    jest.mocked(mockHistory.saveTariffAnnualClaim).mockRejectedValueOnce(new ConcurrencyError());
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
    expect(view.getByText(/zwischenzeitlich geändert/)).toBeTruthy();
    jest
      .mocked(mockHistory.saveTariffAnnualClaim)
      .mockRejectedValueOnce(new Error("private SQL 123"));
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
    expect(view.getByText(/Speichern fehlgeschlagen/)).toBeTruthy();
    expect(view.queryByText(/private SQL/)).toBeNull();
  });
  it("blocks an already opened revocation dialog after a same-revision restore", async () => {
    const view = await openTariff();
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
    const saved = mockHistory.tariffAnnualClaims[0];
    const alert = jest.spyOn(Alert, "alert");
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben deaktivieren" }));
    mockHistory = {
      ...mockHistory,
      tariffAnnualClaims: [
        { ...saved, actualPayment: { grossCents: 100, payoutMonth: "2027-01" } },
      ],
    };
    await view.rerender(<AnnualPaymentScreen />);
    await act(async () =>
      alert.mock.calls[0][2]!.find((item) => item.style === "destructive")!.onPress?.(),
    );
    expect(mockHistory.revokeTariffAnnualClaim).not.toHaveBeenCalled();
    expect(view.getByText(/Datengrundlage hat sich geändert/)).toBeTruthy();
  });
  it("prevents duplicate writes", async () => {
    let finish!: (value: SavedTariffAnnualClaim) => void;
    jest.mocked(mockHistory.saveTariffAnnualClaim).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = await openTariff();
    await fireEvent.press(view.getByRole("button", { name: "Tarifangaben speichern" }));
    await fireEvent.press(view.getByRole("button", { name: "Wird gespeichert" }));
    expect(mockHistory.saveTariffAnnualClaim).toHaveBeenCalledTimes(1);
    const input = jest.mocked(mockHistory.saveTariffAnnualClaim).mock.calls[0][0];
    await act(async () => {
      const saved = {
        claim: input.claim,
        actualPayment: input.actualPayment,
        revoked: false,
        revision: 1,
        updatedAt: work.updatedAt,
      };
      mockHistory = { ...mockHistory, tariffAnnualClaims: [saved] };
      finish(saved);
    });
    expect(view.getByText(/Tarifangaben gespeichert/)).toBeTruthy();
  });
});
