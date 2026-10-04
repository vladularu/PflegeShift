import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import { calculateDatedMonthlyRemuneration } from "@/engine/remuneration-month";
import { Temporal } from "@js-temporal/polyfill";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import type { useRemunerationHistory } from "@/application/remuneration-provider";
import type {
  DatedRemunerationProfile,
  SaveDatedRemunerationProfileInput,
} from "@/domain/remuneration-profile";
import { ConcurrencyError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { RemunerationEditorScreen } from "./remuneration-editor-screen";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import {
  resolver as testResolver,
  candidate,
  shift as payShift,
  work as payWork,
} from "@/engine/remuneration-test-fixtures";
import { selectionCandidate } from "@/rules/tariff-selection-test-fixtures";
import { annualPaymentRuleIssues } from "@/rules/annual-payment-rule-validation";
import { tariffSelectionIssues } from "@/rules/tariff-selection";
import trainingValue from "../../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import krValue from "../../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import tvalValue from "../../../rules/packages/reviewed/tval-pflege-tdl/2027-01.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";

const base: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: null,
  sundayHolidayWorkEligible: null,
  allEmploymentWorkRecorded: null,
  tariff: null,
  manualMonthlyGrossCents: 350000,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const existing: DatedRemunerationProfile = {
  effectiveFrom: "2026-01-01",
  revision: 3,
  data: {
    version: 1,
    weeklyMinutes: 1200,
    selection: { kind: "own-monthly", monthlyGrossCents: 180000 },
  },
  createdAt: base.createdAt,
  updatedAt: base.updatedAt,
};
const mockSave =
  jest.fn<(input: SaveDatedRemunerationProfileInput) => Promise<DatedRemunerationProfile>>();
const mockReload = jest.fn<() => Promise<void>>();
const mockClose = jest.fn();
let mockHistory: ReturnType<typeof useRemunerationHistory>;
let mockPalette = LIGHT_PALETTE;
let mockOptions: Record<string, unknown> = {};
let mockResolver: RuleResolver = bundledRuleResolver;
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockResolver }),
}));

jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationHistory: () => mockHistory,
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("expo-router", () => ({
  router: { back: () => mockClose() },
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) => {
      mockOptions = options;
      return options.headerRight?.() ?? null;
    },
  },
}));
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
  const { Text, Button } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    FormScreen: ({ children }: React.PropsWithChildren) => children,
    FormSection: ({
      children,
      title,
      caption,
    }: React.PropsWithChildren<{ title: string; caption: string }>) => (
      <>
        <Text>{title}</Text>
        <Text>{caption}</Text>
        {children}
      </>
    ),
    FormStatus: ({ error, message }: { error?: string; message?: string }) => (
      <>
        {error ? <Text>{error}</Text> : null}
        {message ? <Text>{message}</Text> : null}
      </>
    ),
    HeaderSaveAction: ({ busy, onPress }: { busy: boolean; onPress: () => void }) => (
      <Button title="Speichern" disabled={busy} onPress={onPress} />
    ),
  };
});
jest.mock("@/ui/form-controls", () => {
  const { TextInput, Button, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const Action = ({
    children,
    onPress,
    disabled,
  }: React.PropsWithChildren<{ onPress: () => void; disabled?: boolean }>) => (
    <Button title={String(children)} onPress={onPress} disabled={disabled} />
  );
  return {
    PrimaryButton: Action,
    SecondaryButton: Action,
    Field: ({
      label,
      inputRef,
      ...props
    }: {
      label: string;
      inputRef?: React.Ref<import("react-native").TextInput>;
    }) => <TextInput accessibilityLabel={label} ref={inputRef} {...props} />,
    DropdownField: ({
      label,
      onChange,
      value,
      options,
    }: {
      label: string;
      value: string | number;
      onChange: (v: string | number) => void;
      options: readonly { value: string | number; label: string }[];
    }) => (
      <View testID={label}>
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

async function start() {
  const screen = await render(<RemunerationEditorScreen profile={base} />);
  await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
  await fireEvent.press(screen.getByRole("button", { name: "Neuen Stand anlegen" }));
  return screen;
}

async function selectTariff(screen: Awaited<ReturnType<typeof start>>, label = candidate.label) {
  await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
  await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
  await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + label }));
  await fireEvent.press(screen.getByRole("button", { name: /Tarifbereich: Krankenhaus/ }));
  await fireEvent.press(screen.getByRole("button", { name: /Tarifgebiet: Übrige/ }));
  await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: P5" }));
  await fireEvent.press(screen.getByRole("button", { name: "Stufe: Stufe 1" }));
}

describe("dated remuneration editor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPalette = LIGHT_PALETTE;
    mockResolver = bundledRuleResolver;
    mockHistory = {
      status: "ready",
      profiles: [],
      allowanceDecisions: [],
      error: null,
      saveProfile: mockSave,
      saveAllowanceDecisions: jest.fn(async () => {
        throw new Error("Unexpected allowance write from remuneration editor");
      }),
      reload: mockReload,
    };
    mockReload.mockResolvedValue(undefined);
    mockSave.mockImplementation(async (input) => ({
      ...existing,
      data: input.data,
      effectiveFrom: input.effectiveFrom,
      revision: input.expectedRevision + 1,
    }));
  });
  it.each([null, "2026-10-01", "2026-10-03"])(
    "confirms the imported/current pay values without typing a date (%s)",
    async (effectiveFrom) => {
      const clock = jest
        .spyOn(Temporal.Now, "plainDateISO")
        .mockReturnValue(Temporal.PlainDate.from("2026-10-04"));
      try {
        mockResolver = testResolver();
        const original: DatedRemunerationProfile = {
          ...existing,
          effectiveFrom,
          data: {
            version: 1,
            weeklyMinutes: 2310,
            selection: {
              kind: "tariff",
              packageId: candidate.packageId,
              variant: "BT_K",
              region: "OTHER",
              group: "P8",
              level: "4",
              fullTimeWeeklyMinutes: 2310,
            },
          },
        };
        mockHistory = { ...mockHistory, profiles: [original] };
        const screen = await render(<RemunerationEditorScreen profile={base} />);
        expect(screen.queryByLabelText("Gültig ab")).toBeNull();
        expect(screen.queryByTestId("Vergütungsstand")).toBeNull();
        expect(screen.getByRole("button", { name: "Entgeltgruppe: P8" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Stufe: Stufe 4" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Tarif: TVöD · Pflege" })).toBeTruthy();
        expect(mockSave).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
        expect(mockSave).toHaveBeenCalledWith({
          effectiveFrom: effectiveFrom ?? "2026-10-01",
          expectedRevision: effectiveFrom === null ? 0 : 3,
          data: original.data,
        });
        expect(original.effectiveFrom).toBe(effectiveFrom);
        expect(mockClose).toHaveBeenCalledTimes(1);
      } finally {
        clock.mockRestore();
      }
    },
  );
  it("waits for the initial history load before opening the simple pay form", async () => {
    mockHistory = { ...mockHistory, status: "loading" };
    const screen = await render(<RemunerationEditorScreen profile={base} />);
    expect(screen.queryByLabelText("Monatliches Brutto in Euro")).toBeNull();
    mockHistory = { ...mockHistory, status: "ready" };
    await screen.rerender(<RemunerationEditorScreen profile={base} />);
    expect(screen.getByLabelText("Monatliches Brutto in Euro").props.value).toBe("3500,00");
    expect(screen.queryByLabelText("Gültig ab")).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it("explains an incomplete optional start date without invalidating the stored tariff", async () => {
    const clock = jest
      .spyOn(Temporal.Now, "plainDateISO")
      .mockReturnValue(Temporal.PlainDate.from("2026-10-04"));
    try {
      mockResolver = testResolver();
      const profile: UserProfile = {
        ...base,
        manualMonthlyGrossCents: null,
        tariff: {
          ...payWork.tariff!,
          payGroup: "P8",
          payLevel: 4,
          sector: "BT_K",
          tariffRegion: "OTHER",
        },
      };
      const screen = await render(<RemunerationEditorScreen profile={profile} />);
      await fireEvent.press(screen.getByRole("button", { name: "Beginn ändern" }));
      await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.05.");
      expect(
        screen.getByText("Bitte ein vollständiges Datum im Format TT.MM.JJJJ eingeben."),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: /tvoed-vka-bt-k · nicht verfügbar/ })).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave).not.toHaveBeenCalled();
      await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.05.2026");
      expect(screen.getByRole("button", { name: "Entgeltgruppe: P8" })).toBeTruthy();
    } finally {
      clock.mockRestore();
    }
  });

  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves TVA-L assistant month brackets and requires a fresh period after category changes",
    async (palette) => {
      mockPalette = palette;
      mockResolver = testResolver([tvalValue as RuleTariffPackage]);
      const screen = await start();
      await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.01.2027");
      await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
      await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + tvalValue.label }));
      await fireEvent.press(screen.getByRole("button", { name: /Tarifbereich: TVA-L Pflege/ }));
      await fireEvent.press(screen.getByRole("button", { name: /Tarifgebiet: West · 38,5/ }));
      await fireEvent.press(
        screen.getByRole("button", {
          name: /Ausbildungskategorie laut Tarifvertrag: Pflege \/ Notfallsanität/,
        }),
      );
      await fireEvent.press(
        screen.getByRole("button", {
          name: "Vergütetes Ausbildungsjahr: 2. vergütetes Ausbildungsjahr",
        }),
      );
      await fireEvent.press(
        screen.getByRole("button", {
          name: /Ausbildungskategorie laut Tarifvertrag: Pflegefachassistenz/,
        }),
      );
      expect(screen.queryByTestId("Vergütetes Ausbildungsjahr")).toBeNull();
      await fireEvent.press(
        screen.getByRole("button", {
          name: "TVA-L-Arbeitgeberregelung: Krankenhausregelung nach § 43 bestätigt",
        }),
      );
      await fireEvent.press(
        screen.getByRole("button", {
          name: "TVA-L-Bezugsregelung: Angestelltenregelung · § 38 Abs. 5 Satz 1",
        }),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave).not.toHaveBeenCalled();
      await fireEvent.press(
        screen.getByRole("button", {
          name: "Vergüteter Ausbildungszeitraum: Ab dem 13. Ausbildungsmonat",
        }),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave).toHaveBeenCalledTimes(1);
      const input = mockSave.mock.calls[0][0];
      expect(input.data.version).toBe(7);
      expect(input.data.selection).toMatchObject({
        packageId: "tval-pflege-tdl",
        tvalEmployerScope: "SECTION_43",
        tvlEmploymentCategory: "SALARIED_SECTION_38_5_1",
        variant: "CARE",
        region: "WEST_38_5",
        group: "assistant",
        level: "2",
      });
      mockHistory = {
        ...mockHistory,
        profiles: [{ ...existing, effectiveFrom: input.effectiveFrom, data: input.data }],
      };
      await screen.unmount();
      const reopened = await render(<RemunerationEditorScreen profile={base} />);
      if (reopened.queryByRole("button", { name: "Frühere Angaben" }))
        await fireEvent.press(reopened.getByRole("button", { name: "Frühere Angaben" }));
      await fireEvent.press(
        reopened.getByRole("button", { name: "Vergütungsstand: Ab 01.01.2027" }),
      );
      await fireEvent.press(reopened.getByRole("button", { name: "Stand korrigieren" }));
      expect(
        reopened.getByRole("button", {
          name: "Vergüteter Ausbildungszeitraum: Ab dem 13. Ausbildungsmonat",
        }).props.accessibilityState.selected,
      ).toBe(true);
      expect(reopened.getByText(/kein vollständiges Gesamtbrutto/)).toBeTruthy();
      expect(
        reopened.getByRole("button", {
          name: "TVA-L-Arbeitgeberregelung: Krankenhausregelung nach § 43 bestätigt",
        }).props.accessibilityState.selected,
      ).toBe(true);
    },
  );
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves, reopens and clears TVA-L activity facts independently of employee care",
    async (palette) => {
      mockPalette = palette;
      mockResolver = testResolver([tvalValue as RuleTariffPackage]);
      const stored: DatedRemunerationProfile = {
        ...existing,
        effectiveFrom: "2027-01-01",
        data: {
          version: 7,
          weeklyMinutes: 1155,
          selection: {
            kind: "tariff",
            packageId: "tval-pflege-tdl",
            variant: "CARE",
            region: "WEST_38_5",
            group: "regular",
            level: "1",
            fullTimeWeeklyMinutes: 2310,
            tvalEmployerScope: "SECTION_43",
            tvlEmploymentCategory: null,
          },
        },
      };
      mockHistory = { ...mockHistory, profiles: [stored] };
      const screen = await render(<RemunerationEditorScreen profile={base} />);
      if (screen.queryByRole("button", { name: "Frühere Angaben" }))
        await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
      await fireEvent.press(screen.getByRole("button", { name: "Vergütungsstand: Ab 01.01.2027" }));
      await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
      expect(
        screen.getByRole("button", {
          name: "TVA-L-Tätigkeitsanspruch: Noch ungeklärt",
          selected: true,
        }),
      ).toBeTruthy();
      expect(screen.queryByText("Pflegezulage")).toBeNull();
      await fireEvent.press(
        screen.getByRole("button", {
          name: "Entgeltanspruch für TVA-L-Zulagen: Ja, Voraussetzungen bestätigt",
        }),
      );
      await fireEvent.press(
        screen.getByRole("button", {
          name: "TVA-L-Tätigkeitsanspruch: Bestätigt · Infektionsstation oder Intensivmedizin",
        }),
      );
      await fireEvent.press(
        screen.getByRole("button", { name: "TVA-L-Schwerbrandpflege nach Nr. 11: Nein" }),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      const input = mockSave.mock.calls[0][0];
      expect(input.data).toMatchObject({
        version: 8,
        selection: {
          tvalCareAllowances: { paidEntitlement: true, clinical: "HIGHER", burnCare: false },
        },
      });
      expect(stored.data.selection).not.toHaveProperty("tvalCareAllowances");
      mockHistory = { ...mockHistory, profiles: [{ ...stored, data: input.data }] };
      await screen.unmount();
      const reopened = await render(<RemunerationEditorScreen profile={base} />);
      if (reopened.queryByRole("button", { name: "Frühere Angaben" }))
        await fireEvent.press(reopened.getByRole("button", { name: "Frühere Angaben" }));
      await fireEvent.press(
        reopened.getByRole("button", { name: "Vergütungsstand: Ab 01.01.2027" }),
      );
      await fireEvent.press(reopened.getByRole("button", { name: "Stand korrigieren" }));
      expect(
        reopened.getByRole("button", {
          name: "TVA-L-Tätigkeitsanspruch: Bestätigt · Infektionsstation oder Intensivmedizin",
          selected: true,
        }),
      ).toBeTruthy();
      await fireEvent.press(
        reopened.getByRole("button", { name: /Tarifgebiet: Tarifgebiet Ost · außerhalb/ }),
      );
      expect(
        reopened.getByRole("button", {
          name: "TVA-L-Tätigkeitsanspruch: Noch ungeklärt",
          selected: true,
        }),
      ).toBeTruthy();
    },
  );
  it("saves an explicit KR region and stage with personal part-time hours and a completeness warning", async () => {
    mockResolver = testResolver([candidate, krValue as RuleTariffPackage]);
    mockPalette = DARK_PALETTE;
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
    await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + krValue.label }));
    expect(screen.getByText(/kein vollständiges Gesamtbrutto/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Tarifbereich: Nichtärztliche/ }));
    await fireEvent.press(screen.getByRole("button", { name: /Tarifgebiet: West · 38,5/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: KR5" }));
    await fireEvent.press(screen.getByRole("button", { name: "Stufe: Stufe 1" }));
    await fireEvent.changeText(screen.getByLabelText("Wochenstunden für diese Vergütung"), "19,25");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      effectiveFrom: "2026-10-01",
      data: {
        version: 4,
        weeklyMinutes: 1155,
        selection: {
          kind: "tariff",
          packageId: "tvl-kr-tdl",
          variant: "SECTION_43",
          region: "WEST_38_5",
          group: "KR5",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          tvlEmploymentCategory: null,
        },
      },
    });
  });
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves explicit TV-L care claims through the actual monthly engine and clears them on group change",
    async (palette) => {
      mockPalette = palette;
      mockResolver = testResolver([krValue as RuleTariffPackage]);
      const screen = await start();
      await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
      await fireEvent.changeText(
        screen.getByLabelText("Wochenstunden für diese Vergütung"),
        "38,5",
      );
      await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
      await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + krValue.label }));
      await fireEvent.press(screen.getByRole("button", { name: /Tarifbereich: Nichtärztliche/ }));
      await fireEvent.press(screen.getByRole("button", { name: /Tarifgebiet: West · 38,5/ }));
      await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: KR7" }));
      await fireEvent.press(screen.getByRole("button", { name: "Stufe: Stufe 2" }));
      expect(mockSave).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Pflegezulage: Noch ungeklärt", selected: true }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", {
          name: "Funktions-/Stationsleitungszulage: Noch ungeklärt",
          selected: true,
        }),
      ).toBeTruthy();
      for (const name of [
        "Entgeltanspruch im Zeitraum: Ja, Voraussetzungen bestätigt",
        "Pflegezulage: Ja, Voraussetzungen bestätigt",
        "Praxisanleitung: Ja, Voraussetzungen bestätigt",
        "Besondere Tätigkeitszulage: Keine zutreffend",
        "Leitungszulage: Keine zutreffend",
        "Schwerbrandpflege nach Nr. 11: Nein",
        "Funktions-/Stationsleitungszulage: Bestätigt · Pflege im Funktionsdienst",
      ])
        await fireEvent.press(screen.getByRole("button", { name }));
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      const saved = mockSave.mock.calls[0][0];
      expect(saved.data.version).toBe(5);
      const result = calculateDatedMonthlyRemuneration({
        month: "2026-10",
        shifts: [],
        workProfile: payWork,
        history: [{ ...existing, ...saved, revision: 1 }],
        allowanceEntitlements: [],
        resolver: mockResolver,
      });
      expect(result.allowances.knownSubtotalCents).toBe(30000);
      expect(result.estimatedGrossCents).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: KR8" }));
      expect(
        screen.getByRole("button", {
          name: "Funktions-/Stationsleitungszulage: Noch ungeklärt",
          selected: true,
        }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Pflegezulage: Noch ungeklärt", selected: true }),
      ).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave.mock.calls[1][0].data.version).toBe(4);
      expect(saved.data.selection).toMatchObject({
        tvlCareAllowances: { nursing: true, functionDuty: "FUNCTION" },
      });
    },
  );
  it("requires a new valid stage after changing from KR5 stage 1 to KR7", async () => {
    mockResolver = testResolver([krValue as RuleTariffPackage]);
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.12.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
    await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + krValue.label }));
    await fireEvent.press(screen.getByRole("button", { name: /Tarifbereich: Nichtärztliche/ }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Tarifgebiet: Tarifgebiet Ost · Universitätskliniken" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: KR5" }));
    await fireEvent.press(screen.getByRole("button", { name: "Stufe: Stufe 1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: KR7" }));
    expect(screen.queryByRole("button", { name: "Stufe: Stufe 1" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Stufe: Stufe 2" }));
    await fireEvent.changeText(screen.getByLabelText("Wochenstunden für diese Vergütung"), "19,25");
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.01.2027");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0].data).toMatchObject({
      weeklyMinutes: 1155,
      selection: {
        group: "KR7",
        level: "2",
        region: "EAST_UNIVERSITY_HOSPITAL",
        fullTimeWeeklyMinutes: 2370,
      },
    });
  });
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "edits and explicitly clears a stored TV-L category without changing the saved source",
    async (palette) => {
      mockPalette = palette;
      mockResolver = testResolver([krValue as RuleTariffPackage]);
      const stored: DatedRemunerationProfile = {
        ...existing,
        effectiveFrom: "2026-10-01",
        data: {
          version: 4,
          weeklyMinutes: 1155,
          selection: {
            kind: "tariff",
            packageId: "tvl-kr-tdl",
            variant: "SECTION_43",
            region: "WEST_38_5",
            group: "KR5",
            level: "1",
            fullTimeWeeklyMinutes: 2310,
            tvlEmploymentCategory: "SALARIED_SECTION_38_5_1",
          },
        },
      };
      mockHistory = { ...mockHistory, profiles: [stored] };
      const screen = await render(<RemunerationEditorScreen profile={base} />);
      if (screen.queryByRole("button", { name: "Frühere Angaben" }))
        await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
      await fireEvent.press(screen.getByRole("button", { name: "Vergütungsstand: Ab 01.10.2026" }));
      await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
      expect(
        screen.getByRole("button", {
          name: /TV-L-Beschäftigtenkategorie: Angestelltenregelung/,
          selected: true,
        }),
      ).toBeTruthy();
      expect(screen.getByText(/nicht dein Alter oder Einstellungsdatum/)).toBeTruthy();
      await fireEvent.press(
        screen.getByRole("button", {
          name: "TV-L-Beschäftigtenkategorie: Noch ungeklärt",
        }),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave.mock.calls[0][0]).toMatchObject({
        effectiveFrom: "2026-10-01",
        expectedRevision: 3,
        data: { version: 4, selection: { tvlEmploymentCategory: null } },
      });
      expect(stored.data.selection).toMatchObject({
        tvlEmploymentCategory: "SALARIED_SECTION_38_5_1",
      });
    },
  );
  it("saves an explicit TV-L category and clears it on region or tariff changes", async () => {
    mockResolver = testResolver([candidate, krValue as RuleTariffPackage]);
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
    await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + krValue.label }));
    await fireEvent.press(screen.getByRole("button", { name: /Tarifbereich: Nichtärztliche/ }));
    await fireEvent.press(screen.getByRole("button", { name: /Tarifgebiet: West · 38,5/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: KR5" }));
    await fireEvent.press(screen.getByRole("button", { name: "Stufe: Stufe 1" }));
    await fireEvent.press(
      screen.getByRole("button", {
        name: /TV-L-Beschäftigtenkategorie: Angestelltenregelung/,
      }),
    );
    // A no-op region selection must retain the user's explicit choice.
    await fireEvent.press(screen.getByRole("button", { name: /Tarifgebiet: West · 38,5/ }));
    expect(
      screen.getByRole("button", {
        name: /TV-L-Beschäftigtenkategorie: Angestelltenregelung/,
        selected: true,
      }),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Tarifgebiet: Tarifgebiet Ost · Universitätskliniken",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "TV-L-Beschäftigtenkategorie: Noch ungeklärt",
        selected: true,
      }),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "TV-L-Beschäftigtenkategorie: Übrige Beschäftigte",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + candidate.label }));
    expect(screen.queryByTestId("TV-L-Beschäftigtenkategorie")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + krValue.label }));
    expect(
      screen.getByRole("button", {
        name: "TV-L-Beschäftigtenkategorie: Noch ungeklärt",
        selected: true,
      }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Tarifbereich: Nichtärztliche/ }));
    await fireEvent.press(screen.getByRole("button", { name: /Tarifgebiet: West · 38,5/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: KR5" }));
    await fireEvent.press(screen.getByRole("button", { name: "Stufe: Stufe 1" }));
    await fireEvent.press(
      screen.getByRole("button", {
        name: "TV-L-Beschäftigtenkategorie: Übrige Beschäftigte",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0].data).toMatchObject({
      version: 4,
      selection: { tvlEmploymentCategory: "OTHER", region: "WEST_38_5" },
    });
  });
  it("changes to hourly pay only with an explicitly entered wage and no second part-time reduction", async () => {
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Grundvergütung: Stundenlohn" }));
    expect(screen.getByLabelText("Stundenlohn in Euro").props.value).toBe("");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Stundenlohn in Euro"), "21,37");
    await fireEvent.changeText(screen.getByLabelText("Wochenstunden für diese Vergütung"), "19,25");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0].data).toMatchObject({
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: {
          base: { kind: "hourly", centsPerHour: 2137 },
          percentageBasisHourlyCents: null,
        },
      },
    });
  });
  it("adds a night premium and dated allowance, requiring an explicit overlap choice", async () => {
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.changeText(screen.getByLabelText("Monatliches Brutto in Euro"), "2000");
    expect(screen.queryByLabelText("Zuschlag 1 · Beginn")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Zeitzuschlag hinzufügen" }));
    await fireEvent.changeText(screen.getByLabelText("Zuschlag 1 · Beginn"), "22:00");
    await fireEvent.changeText(screen.getByLabelText("Zuschlag 1 · Ende"), "06:00");
    await fireEvent.changeText(screen.getByLabelText("Zuschlag 1 in Prozent"), "25");
    await fireEvent.changeText(screen.getByLabelText("Bestätigter Stundenwert in Euro"), "20");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByText(/wie zusammentreffende Zuschläge/)).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Zusammentreffende Zuschläge: Addieren" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Zulage hinzufügen" }));
    await fireEvent.changeText(screen.getByLabelText("Zulage 1 · Bezeichnung"), "Funktion");
    await fireEvent.changeText(screen.getByLabelText("Zulage 1 · Euro/Monat"), "80,50");
    await fireEvent.changeText(screen.getByLabelText("Zulage 1 · Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0].data.selection).toMatchObject({
      kind: "own-configured",
      configuration: {
        percentageBasisHourlyCents: 2000,
        timePremiums: {
          combination: "add",
          rules: [
            {
              id: "premium-1",
              type: "night",
              window: { startMinute: 1320, endMinute: 360 },
              rate: { kind: "percent", basisPoints: 2500 },
            },
          ],
        },
        fixedAllowances: [
          {
            id: "allowance-1",
            title: "Funktion",
            monthlyCents: 8050,
            partialMonth: "unconfirmed",
            validFrom: "2026-10-01",
            validTo: null,
          },
        ],
      },
    });
    const saved = mockSave.mock.calls[0][0];
    const calculated = calculateDatedMonthlyRemuneration({
      month: "2026-10",
      shifts: [payShift({ date: "2026-10-15" })],
      workProfile: payWork,
      history: [{ ...existing, data: saved.data, effectiveFrom: saved.effectiveFrom }],
      allowanceEntitlements: [],
      resolver: mockResolver,
    });
    expect(calculated.estimatedGrossCents).toBe(209050);
  });
  it("removes only the explicitly removed draft component and preserves other IDs", async () => {
    const screen = await start();
    await fireEvent.press(screen.getByRole("button", { name: "Zeitzuschlag hinzufügen" }));
    await fireEvent.press(screen.getByRole("button", { name: "Zeitzuschlag hinzufügen" }));
    await fireEvent.changeText(screen.getByLabelText("Zuschlag 2 in Prozent"), "35");
    await fireEvent.press(screen.getByRole("button", { name: "Zuschlag 1 entfernen" }));
    expect(screen.getByLabelText("Zuschlag 1 in Prozent").props.value).toBe("35");
    await fireEvent.press(screen.getByRole("button", { name: "Zeitzuschlag hinzufügen" }));
    expect(screen.getByLabelText("Zuschlag 1 in Prozent").props.value).toBe("35");
    expect(screen.getByLabelText("Zuschlag 2 in Prozent").props.value).toBe("");
    expect(mockSave).not.toHaveBeenCalled();
  });
  it("saves explicit overtime and special payment parameters including unknown entitlement", async () => {
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Überstundenvergütung: Einrichten" }));
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Grundvergütung der Überstunden bereits enthalten: Ja, nur Zuschlag zusätzlich",
      }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Überstundenzuschlag: Zuschlag einrichten" }),
    );
    await fireEvent.changeText(screen.getByLabelText("Überstundenzuschlag in Prozent"), "30");
    await fireEvent.press(screen.getByRole("button", { name: "Sonderzahlung hinzufügen" }));
    await fireEvent.changeText(
      screen.getByLabelText("Sonderzahlung 1 · Bezeichnung"),
      "Weihnachtsgeld",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Sonderzahlung 1 · Berechnungsart: Prozentsatz" }),
    );
    await fireEvent.changeText(screen.getByLabelText("Sonderzahlung 1 in Prozent"), "75");
    await fireEvent.changeText(
      screen.getByLabelText("Sonderzahlung 1 · Bestätigter Bemessungsbetrag in Euro"),
      "3000",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Sonderzahlung 1 · Auszahlungsmonat (1–12)"),
      "11",
    );
    await fireEvent.changeText(screen.getByLabelText("Sonderzahlung 1 · Gültig ab"), "01.01.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0].data.selection).toMatchObject({
      configuration: {
        overtime: { basePayIncluded: true, premium: { kind: "percent", basisPoints: 3000 } },
        specialPayments: [
          {
            title: "Weihnachtsgeld",
            payoutMonth: 11,
            entitlementMonths: null,
            amount: { kind: "percent", basisPoints: 7500, confirmedBasisCents: 300000 },
          },
        ],
      },
    });
  });
  it("requires an explicit valid date and preserves the personal amount and weekly hours", async () => {
    const screen = await start();
    expect(screen.getByLabelText("Gültig ab").props.value).toBe("");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "31.02.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.changeText(screen.getByLabelText("Monatliches Brutto in Euro"), "1800,50");
    await fireEvent.changeText(screen.getByLabelText("Wochenstunden für diese Vergütung"), "19,25");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        effectiveFrom: "2026-10-01",
        expectedRevision: 0,
        data: expect.objectContaining({
          version: 2,
          weeklyMinutes: 1155,
          selection: {
            kind: "own-configured",
            configuration: expect.objectContaining({
              base: { kind: "monthly", personalCents: 180050, partialMonth: "unconfirmed" },
            }),
          },
        }),
      }),
    );
    expect(screen.getByText("Vergütungsstand ab 01.10.2026 gespeichert.")).toBeTruthy();
    expect(screen.getByLabelText("Gültig ab").props.editable).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[1][0].expectedRevision).toBe(1);
  });
  it("edits an explicit existing revision without allowing a date change", async () => {
    mockHistory = { ...mockHistory, profiles: [existing] };
    const screen = await render(<RemunerationEditorScreen profile={base} />);
    if (screen.queryByRole("button", { name: "Frühere Angaben" }))
      await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
    await fireEvent.press(screen.getByRole("button", { name: "Vergütungsstand: Ab 01.01.2026" }));
    await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
    expect(screen.getByLabelText("Gültig ab").props.editable).toBe(false);
    expect(screen.getByText(/Eine Korrektur ändert diesen bestehenden Stand/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).toHaveBeenCalledWith({
      effectiveFrom: "2026-01-01",
      expectedRevision: 3,
      data: expect.objectContaining({
        weeklyMinutes: existing.data.weeklyMinutes,
        selection: {
          kind: "own-configured",
          configuration: expect.objectContaining({
            base: { kind: "monthly", personalCents: 180000, partialMonth: "unconfirmed" },
          }),
        },
      }),
    });
  });
  it("copies an undated legacy profile only into a new explicitly dated draft", async () => {
    mockHistory = { ...mockHistory, profiles: [{ ...existing, effectiveFrom: null }] };
    const screen = await render(<RemunerationEditorScreen profile={base} />);
    if (screen.queryByRole("button", { name: "Frühere Angaben" }))
      await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Vergütungsstand: Übernommener Stand · Beginn unbekannt",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Als Vorlage verwenden" }));
    expect(screen.getByLabelText("Gültig ab").props.value).toBe("");
    expect(screen.getByLabelText("Monatliches Brutto in Euro").props.value).toBe("1800,00");
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0].expectedRevision).toBe(0);
  });
  it("does not reinterpret an unknown tariff as TVöD", async () => {
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...existing,
          data: {
            ...existing.data,
            selection: {
              kind: "tariff",
              packageId: "future-tariff",
              region: "future",
              variant: "future",
              group: "A",
              level: "A",
              fullTimeWeeklyMinutes: 2400,
            },
          },
        },
      ],
    };
    const screen = await render(<RemunerationEditorScreen profile={base} />);
    if (screen.queryByRole("button", { name: "Frühere Angaben" }))
      await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
    await fireEvent.press(screen.getByRole("button", { name: "Vergütungsstand: Ab 01.01.2026" }));
    await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
    expect(screen.getByText(/Dieser Tarifstand kann/)).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it("retains the draft after a conflict without advancing the revision", async () => {
    mockSave.mockRejectedValueOnce(new ConcurrencyError("Der Stand wurde inzwischen geändert."));
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.changeText(screen.getByLabelText("Monatliches Brutto in Euro"), "2222");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Der Stand wurde inzwischen geändert.")).toBeTruthy();
    expect(screen.getByLabelText("Monatliches Brutto in Euro").props.value).toBe("2222");
    expect(screen.getByLabelText("Gültig ab").props.editable).toBe(true);
    expect(mockSave.mock.calls[0][0].expectedRevision).toBe(0);
  });
  it("keeps a committed save successful when the history refresh fails", async () => {
    mockSave.mockImplementationOnce(async (input) => {
      mockHistory = { ...mockHistory, status: "error", error: "Historie nicht geladen." };
      return { ...existing, ...input, revision: 1 };
    });
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Vergütungsstand ab 01.10.2026 gespeichert.")).toBeTruthy();
    expect(screen.getByText("Historie nicht geladen.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Historie erneut laden" }));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
  it("disables duplicate saving and cancel while the write is pending", async () => {
    let finish!: (record: DatedRemunerationProfile) => void;
    mockSave.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    await fireEvent.press(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByLabelText("Gültig ab")).toBeTruthy();
    expect(mockSave).toHaveBeenCalledTimes(1);
    await act(() => finish({ ...existing, effectiveFrom: "2026-10-01", revision: 1 }));
  });
  it("updates header colors without losing the draft during theme and history changes", async () => {
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Monatliches Brutto in Euro"), "2222");
    for (const palette of [DARK_PALETTE, LIGHT_PALETTE]) {
      mockPalette = palette;
      mockHistory = { ...mockHistory, status: "loading" };
      await screen.rerender(<RemunerationEditorScreen profile={base} />);
      expect(screen.getByLabelText("Monatliches Brutto in Euro").props.value).toBe("2222");
      expect(mockOptions.headerStyle).toEqual({ backgroundColor: palette.background });
      expect(mockOptions.headerTintColor).toBe(palette.text);
    }
    expect(mockSave).not.toHaveBeenCalled();
  });
  it("offers retry instead of editing stale history after an initial load failure", async () => {
    mockHistory = {
      ...mockHistory,
      status: "error",
      error: "Historie nicht geladen.",
      profiles: [existing],
    };
    const screen = await render(<RemunerationEditorScreen profile={base} />);
    if (screen.queryByRole("button", { name: "Frühere Angaben" }))
      await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
    expect(screen.queryByText("Neuen Stand anlegen")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
  it("can copy an older remuneration stand into a new period covered by the active catalog", async () => {
    const clock = jest
      .spyOn(Temporal.Now, "plainDateISO")
      .mockReturnValue(Temporal.PlainDate.from("2026-09-22"));
    try {
      mockResolver = testResolver();
      mockHistory = {
        ...mockHistory,
        profiles: [
          {
            ...existing,
            data: {
              ...existing.data,
              selection: {
                kind: "tariff",
                packageId: candidate.packageId,
                variant: "BT_K",
                region: "OTHER",
                group: "P5",
                level: "1",
                fullTimeWeeklyMinutes: 2310,
              },
            },
          },
        ],
      };
      const screen = await start();
      await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave.mock.calls[0][0]).toMatchObject({
        effectiveFrom: "2026-10-01",
        expectedRevision: 0,
        data: { selection: { group: "P5", level: "1" } },
      });
    } finally {
      clock.mockRestore();
    }
  });
  it.each(["new", "correction", "legacy-copy"])(
    "edits every v2 component without loss through the %s form",
    async (mode) => {
      const ownData = {
        version: 2,
        weeklyMinutes: 1155,
        selection: {
          kind: "own-configured",
          configuration: ownRemunerationFixture(),
        },
      } as const;
      mockHistory = {
        ...mockHistory,
        profiles: [
          {
            ...existing,
            effectiveFrom: mode === "correction" ? "2026-10-01" : null,
            data: ownData,
          },
        ],
      };
      const screen = await render(<RemunerationEditorScreen profile={base} />);
      if (screen.queryByRole("button", { name: "Frühere Angaben" }))
        await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
      if (mode === "new") {
        await fireEvent.press(screen.getByRole("button", { name: "Neuen Stand anlegen" }));
      } else if (mode === "correction") {
        await fireEvent.press(
          screen.getByRole("button", { name: "Vergütungsstand: Ab 01.10.2026" }),
        );
        await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
      } else {
        await fireEvent.press(screen.getByRole("button", { name: /Vergütungsstand: Übernommen/ }));
        await fireEvent.press(screen.getByRole("button", { name: "Als Vorlage verwenden" }));
      }
      if (mode !== "correction")
        await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave).toHaveBeenCalledWith({
        data: ownData,
        effectiveFrom: "2026-10-01",
        expectedRevision: mode === "correction" ? 3 : 0,
      });
      expect(mockHistory.profiles[0].data).toEqual(ownData);
    },
  );
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves an explicit training category and year from the real catalog",
    async (palette) => {
      mockPalette = palette;
      mockResolver = testResolver([candidate, trainingValue as RuleTariffPackage]);
      const screen = await start();
      await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
      await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
      await fireEvent.press(screen.getByRole("button", { name: "Tarif: TVAöD-Pflege · VKA" }));
      await fireEvent.press(screen.getByRole("button", { name: /Tarifbereich: Krankenhaus/ }));
      await fireEvent.press(
        screen.getByRole("button", { name: "Tarifgebiet: KAV Baden-Württemberg" }),
      );
      expect(screen.queryByTestId("Entgeltgruppe")).toBeNull();
      expect(screen.queryByTestId("Stufe")).toBeNull();
      expect(screen.getByLabelText("Tarifliche Vollzeit pro Woche").props.value).toBe("38,5");
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave).not.toHaveBeenCalled();
      await fireEvent.press(
        screen.getByRole("button", { name: /Ausbildungskategorie laut Tarifvertrag: Kategorie b/ }),
      );
      await fireEvent.press(
        screen.getByRole("button", { name: "Vergütetes Ausbildungsjahr: 2. Ausbildungsjahr" }),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      const input = mockSave.mock.calls[0][0];
      expect(input.data.selection).toMatchObject({
        kind: "tariff",
        packageId: "tvaoed-pflege-vka",
        group: "b",
        level: "2",
        region: "KAV_BW",
        fullTimeWeeklyMinutes: 2310,
      });
      const result = calculateDatedMonthlyRemuneration({
        month: "2026-10",
        shifts: [],
        workProfile: base,
        history: [{ ...existing, effectiveFrom: input.effectiveFrom, data: input.data }],
        allowanceEntitlements: [],
        resolver: mockResolver,
      });
      expect(result.base.totalCents).toBe(155207);
      expect(result.estimatedGrossCents).toBeNull();
    },
  );
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "saves and reloads an explicit special-duty claim without copying it across tariff regions",
    async (palette) => {
      mockPalette = palette;
      mockResolver = testResolver([candidate, trainingValue as RuleTariffPackage]);
      const trainingData = {
        version: 3,
        weeklyMinutes: 2310,
        selection: {
          kind: "tariff",
          packageId: "tvaoed-pflege-vka",
          variant: "BT_K",
          region: "OTHER",
          group: "b",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          specialDutyAllowance: "PE1_ONLY",
        },
      } as const;
      mockHistory = {
        ...mockHistory,
        profiles: [{ ...existing, effectiveFrom: "2026-10-01", data: trainingData }],
      };
      const screen = await render(<RemunerationEditorScreen profile={base} />);
      if (screen.queryByRole("button", { name: "Frühere Angaben" }))
        await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
      await fireEvent.press(screen.getByRole("button", { name: "Vergütungsstand: Ab 01.10.2026" }));
      await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave.mock.calls[0][0].data).toEqual(trainingData);
      const result = calculateDatedMonthlyRemuneration({
        month: "2026-10",
        shifts: [],
        workProfile: base,
        history: [
          { ...existing, effectiveFrom: "2026-10-01", data: mockSave.mock.calls[0][0].data },
        ],
        allowanceEntitlements: [
          {
            from: "2026-10-01",
            through: "2026-10-31",
            status: "NONE",
            origin: "confirmed",
            revision: 1,
          },
        ],
        resolver: mockResolver,
      });
      expect(result.allowances.totalCents).toBe(2301);
      // Reopen the same saved selection. A different region needs a fresh confirmation.
      await fireEvent.press(screen.getByRole("button", { name: "Zur Übersicht" }));
      await fireEvent.press(screen.getByRole("button", { name: "Vergütungsstand: Ab 01.10.2026" }));
      await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
      await fireEvent.press(
        screen.getByRole("button", { name: "Tarifgebiet: KAV Baden-Württemberg" }),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave.mock.calls[1][0].data.selection).toMatchObject({
        specialDutyAllowance: null,
      });
      await fireEvent.press(screen.getByRole("button", { name: "Zur Übersicht" }));
      await fireEvent.press(screen.getByRole("button", { name: "Vergütungsstand: Ab 01.10.2026" }));
      await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
      await fireEvent.press(
        screen.getByRole("button", {
          name: "Tätigkeitszulagen: Keine Tätigkeitszulagen zutreffend",
        }),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockSave.mock.calls[2][0].data.selection).toMatchObject({
        specialDutyAllowance: "NONE",
      });
    },
  );
  it("selects explicit catalog values and clears a stage invalid for the next group", async () => {
    mockResolver = testResolver([selectionCandidate()]);
    const screen = await start();
    await selectTariff(screen, candidate.label);
    await fireEvent.press(screen.getByRole("button", { name: "Entgeltgruppe: P7" }));
    expect(screen.queryByRole("button", { name: "Stufe: Stufe 1" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Stufe: Stufe 2" }));
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0].data.selection).toMatchObject({
      kind: "tariff",
      packageId: candidate.packageId,
      variant: "BT_K",
      region: "OTHER",
      group: "P7",
      level: "2",
      fullTimeWeeklyMinutes: 2310,
    });
  });
  it("rejects a catalog missing an explicitly required regional declaration", async () => {
    const limited = selectionCandidate();
    const variant = limited.rules.selection!.variants.find((item) => item.id === "BT_B")!;
    variant.regions = variant.regions.filter(
      (region) => region.id === "OTHER",
    ) as typeof variant.regions;
    expect(tariffSelectionIssues(limited)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_TARIFF_SELECTION" })]),
    );
    mockResolver = testResolver([limited]);
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
    expect(screen.queryByRole("button", { name: "Tarif: " + candidate.label })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tarifgebiet: KAV Baden-Württemberg" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tarifgebiet: Übrige/ })).toBeNull();
    expect(
      screen.getByText(
        candidate.label + ": Auswahl oder Tarifkomponenten werden noch nicht unterstützt.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
  });
  it("preserves the draft and requires acknowledgement of a catalog change", async () => {
    mockResolver = testResolver();
    const screen = await start();
    await selectTariff(screen);
    const next = structuredClone(candidate);
    next.rules.weeklyWorkingTimeRules!.forEach((rule) => {
      rule.fullTimeWeeklyMinutes = 2400;
    });
    mockResolver = testResolver([next]);
    await screen.rerender(<RemunerationEditorScreen profile={base} />);
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Tarifliche Vollzeit pro Woche").props.value).toBe("38,5");
    await fireEvent.press(screen.getByRole("button", { name: "Aktuellen Tarifstand übernehmen" }));
    expect(screen.getByLabelText("Tarifliche Vollzeit pro Woche").props.value).toBe("40");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0].data.selection).toMatchObject({
      group: "P5",
      level: "1",
      fullTimeWeeklyMinutes: 2400,
    });
  });
  it("rejects an incomplete remote catalog without replacing its missing rows with embedded values", async () => {
    const next = structuredClone(candidate);
    next.rules.payTables[0].entries = next.rules.payTables[0].entries.filter(
      (row) => row.groupId !== "p5",
    ) as (typeof next.rules.payTables)[number]["entries"];
    expect(annualPaymentRuleIssues(next)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ANNUAL_PAYMENT_GROUP" })]),
    );
    mockResolver = testResolver([next]);
    const screen = await start();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Berechnung: Tarif" }));
    expect(screen.queryByRole("button", { name: "Tarif: " + candidate.label })).toBeNull();
    expect(screen.queryByRole("button", { name: "Entgeltgruppe: P5" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Entgeltgruppe: P6" })).toBeNull();
    expect(
      screen.getByText(
        candidate.label + ": Auswahl oder Tarifkomponenten werden noch nicht unterstützt.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
  });
  it("preserves a selection when its effective date leaves the available catalog", async () => {
    mockResolver = testResolver();
    const screen = await start();
    await selectTariff(screen);
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.04.2027");
    expect(
      screen.getByRole("button", { name: "Entgeltgruppe: P5 · nicht verfügbar" }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Gültig ab"), "01.10.2026");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0].data.selection).toMatchObject({ group: "P5", level: "1" });
  });
  it("edits an existing dated rule basis without passing through the obsolete work-profile validator", async () => {
    const next = structuredClone(candidate);
    next.rules.weeklyWorkingTimeRules!.forEach((rule) => {
      rule.fullTimeWeeklyMinutes = 2400;
    });
    mockResolver = testResolver([next]);
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...existing,
          effectiveFrom: "2026-10-01",
          data: {
            version: 1,
            weeklyMinutes: 1200,
            selection: {
              kind: "tariff",
              packageId: candidate.packageId,
              variant: "BT_K",
              region: "OTHER",
              group: "P5",
              level: "1",
              fullTimeWeeklyMinutes: 2400,
            },
          },
        },
      ],
    };
    const screen = await render(<RemunerationEditorScreen profile={base} />);
    if (screen.queryByRole("button", { name: "Frühere Angaben" }))
      await fireEvent.press(screen.getByRole("button", { name: "Frühere Angaben" }));
    await fireEvent.press(screen.getByRole("button", { name: "Vergütungsstand: Ab 01.10.2026" }));
    await fireEvent.press(screen.getByRole("button", { name: "Stand korrigieren" }));
    expect(screen.getByLabelText("Tarifliche Vollzeit pro Woche").props.value).toBe("40");
    await fireEvent.press(screen.getByRole("button", { name: "Tarif: " + candidate.label }));
    await fireEvent.press(screen.getByRole("button", { name: "Tarifbereich: Krankenhaus · BT-K" }));
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      expectedRevision: 3,
      data: { selection: { group: "P5", level: "1", fullTimeWeeklyMinutes: 2400 } },
    });
  });
});
