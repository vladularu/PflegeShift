import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import { AnnualDetailsScreen } from "./annual-details-screen";
import { WorktimeDetailsScreen } from "./worktime-details-screen";
import { ComplianceDetailsScreen } from "./compliance-details-screen";
import * as MockReact from "react";
import type { ReactElement } from "react";

import holidayPackageValue from "../../../rules/packages/reviewed/de-holidays/2026.json";
import futureHolidayPackageValue from "../../../rules/packages/reviewed/de-holidays/2027.json";
import legalPackageValue from "../../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import tariffPackageValue from "../../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json";
import type { MonthlyComplianceResult, ShiftEntry, UserProfile } from "@/domain/types";
import { AnalysisScreen } from "@/features/analysis/analysis-screen";
import { buildAnnualCoreReport } from "@/features/analysis/annual-core-report";
import type { AnnualReport } from "@/features/analysis/annual-report";
import { PremiumDetailsScreen } from "@/features/analysis/premium-details-screen";
import { TariffAssessmentScreen } from "@/features/analysis/tariff-assessment-screen";
import { SalaryScreen } from "@/features/salary/salary-screen";
import type {
  RuleHolidayPackage,
  RuleLegalPackage,
  RuleTariffPackage,
} from "@/rules/contracts.generated";
import { createRuleResolver, RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";
import { AppErrorBoundary } from "@/ui/app-error-boundary";

const GENERATION_ONE_REVIEWED_RESOLVER = createRuleResolver(
  {
    tariff: [tariffPackageValue as RuleTariffPackage],
    legal: [legalPackageValue as RuleLegalPackage],
    holiday: [holidayPackageValue as RuleHolidayPackage],
  },
  {
    tariff: "tvoed-vka-bt-k",
    legal: "de-arbzg-care",
    holiday: "de-holidays",
  },
);

const FUTURE_HOLIDAY_TARIFF_EXPIRY_RESOLVER = createRuleResolver(
  {
    tariff: [tariffPackageValue as RuleTariffPackage],
    legal: [legalPackageValue as RuleLegalPackage],
    holiday: [
      holidayPackageValue as RuleHolidayPackage,
      futureHolidayPackageValue as RuleHolidayPackage,
    ],
  },
  {
    tariff: "tvoed-vka-bt-k",
    legal: "de-arbzg-care",
    holiday: "de-holidays",
  },
);

const FUTURE_HOLIDAY_MISSING_LEGAL_RESOLVER = createRuleResolver(
  {
    tariff: [tariffPackageValue as RuleTariffPackage],
    legal: [],
    holiday: [
      holidayPackageValue as RuleHolidayPackage,
      futureHolidayPackageValue as RuleHolidayPackage,
    ],
  },
  {
    tariff: "tvoed-vka-bt-k",
    legal: "de-arbzg-care",
    holiday: "de-holidays",
  },
);

const MOCK_TARIFF_PROFILE: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2_310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: {
    payGroup: "P8",
    payLevel: 4,
    sector: "BT_K",
    tariffRegion: "OTHER",
    fullTimeWeeklyMinutes: 2_310,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
let mockProfile: UserProfile = MOCK_TARIFF_PROFILE;

const mockCompliance: MonthlyComplianceResult = {
  month: "2027-01",
  criticalCount: 0,
  warningCount: 0,
  infoCount: 0,
  affectedDates: [],
  issues: [],
};

let mockComplianceResult: MonthlyComplianceResult | null = mockCompliance;
let mockCheckError: string | null = null;
let mockEntries: readonly ShiftEntry[] = [];
let mockRuleResolver: RuleResolver = GENERATION_ONE_REVIEWED_RESOLVER;
let mockRouteMonth = "2027-01";
let mockAnnualSection: string | undefined;
let mockAnnualFatalError: Error | null = null;
let mockAnnualInputFailure: {
  readonly ok: false;
  readonly error: RuleResolutionError;
  readonly failure: RuleResolutionError["failure"];
} | null = null;
let mockAnnualReportValue: AnnualReport | null = null;
let mockAnnualCoreValue: AnnualReport | null = null;
let mockAnnualRuleFailure: {
  readonly ok: false;
  readonly error: RuleResolutionError;
  readonly failure: RuleResolutionError["failure"];
} | null = null;

let mockFocused = true;
const mockActiveMonthCoordinator = {
  getMonth: () => mockRouteMonth,
  setMonth: jest.fn((month: string) => month),
};

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) =>
    MockReact.useEffect(() => (mockFocused ? effect() : undefined), [effect, mockFocused]),
  useIsFocused: () => mockFocused,
  useLocalSearchParams: () => ({ month: mockRouteMonth, section: mockAnnualSection }),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
  usePflegeShiftProfile: () => ({ profile: mockProfile }),
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
  usePflegeShiftTariff: () => ({
    tariffDecisions: [],
    workPatternSettings: {
      workplaceCoverage: "UNKNOWN",
      assignment: "UNKNOWN",
      updatedAt: null,
    },
    updateWorkPatternSettings: jest.fn(),
    upsertTariffDecision: jest.fn(),
  }),
  usePflegeShiftTestData: () => ({ testMonths: [] }),
}));

jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockRuleResolver }),
}));

jest.mock("@/features/analysis/use-monthly-compliance", () => ({
  useDeferredMonthlyCompliance: () => ({
    error: mockCheckError,
    result: mockComplianceResult,
    retry: jest.fn(),
  }),
}));

jest.mock("@/features/analysis/use-annual-report-inputs", () => ({
  useAnnualReportInputs: () =>
    mockAnnualInputFailure ?? {
      ok: true,
      value: {
        entries: [],
        rangeEnd: "2026-12-31",
        rangeStart: "2026-01-01",
        tariffDecisions: [],
        year: 2026,
      },
    },
}));

jest.mock("@/features/analysis/use-annual-report", () => ({
  useDeferredAnnualReport: () => ({
    error: null,
    fatalError: mockAnnualFatalError,
    report: mockAnnualReportValue,
    coreReport: mockAnnualCoreValue,
    retry: jest.fn(),
    ruleFailure: mockAnnualRuleFailure,
  }),
}));

jest.mock("@/navigation/active-month", () => ({
  useActiveMonthCoordinator: () => mockActiveMonthCoordinator,
}));

function januaryShift(): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "january-shift",
    date: "2027-01-03",
    templateId: null,
    title: "Sonntagsdienst",
    type: "DAY",
    startTime: "08:00",
    endTime: "16:00",
    breakMinutes: 30,
    color: "#207A68",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function expectPartialAnalysisShell(
  screen: Awaited<ReturnType<typeof render>>,
  salaryUnavailable = true,
) {
  expect(screen.getByTestId("analysis-month-toolbar")).toBeTruthy();
  if (salaryUnavailable) {
    expect(screen.getByRole("button", { name: /Gehalt, Nicht verfügbar/ })).toBeTruthy();
  } else {
    expect(screen.queryByRole("button", { name: /Gehalt, Nicht verfügbar/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Gehalt, \d/ })).toBeTruthy();
  }
  expect(screen.getByLabelText("Soll: Nicht verfügbar")).toBeTruthy();
  expect(screen.getByLabelText("Stundensaldo: Nicht verfügbar")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Diagnosecode: RULE_PACKAGE_NOT_FOUND")).toBeNull();
  expect(screen.queryByText("LUNA Shift konnte nicht angezeigt werden")).toBeNull();
}

async function expectRuleCoverageDiagnostic(component: ReactElement) {
  mockEntries = [januaryShift()];
  const screen = await render(component);

  expect(screen.getByText("Diagnosecode: RULE_PACKAGE_NOT_FOUND")).toBeTruthy();
  expect(screen.queryByText("LUNA Shift konnte nicht angezeigt werden")).toBeNull();
}

describe("reviewed Generation 1 rule coverage in analysis screens", () => {
  beforeEach(() => {
    mockComplianceResult = mockCompliance;
    mockCheckError = null;
    mockEntries = [];
    mockFocused = true;
    mockRuleResolver = GENERATION_ONE_REVIEWED_RESOLVER;
    mockRouteMonth = "2027-01";
    mockAnnualSection = undefined;
    mockAnnualFatalError = null;
    mockAnnualInputFailure = null;
    mockAnnualReportValue = null;
    mockAnnualCoreValue = null;
    mockAnnualRuleFailure = null;
    mockProfile = MOCK_TARIFF_PROFILE;
    mockActiveMonthCoordinator.setMonth.mockClear();
  });

  it.each([
    ["Prüfung", "/compliance-details"],
    ["Gehalt", "/salary"],
  ])("opens %s for the selected month and keeps return navigation", async (title, pathname) => {
    mockRouteMonth = "2026-09";
    const screen = await render(<AnalysisScreen />);
    const name = new RegExp(`^${title},`);
    await fireEvent.press(screen.getByRole("button", { name }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname, params: { month: "2026-09" } });
    mockFocused = false;
    await screen.rerender(<AnalysisScreen />);
    mockRouteMonth = "2026-10";
    mockFocused = true;
    await screen.rerender(<AnalysisScreen />);
    await fireEvent.press(screen.getByRole("button", { name }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname, params: { month: "2026-10" } });
  });

  it("shows pending and failed checks without hiding hours or inventing a clear result", async () => {
    mockRouteMonth = "2026-09";
    mockComplianceResult = null;
    const screen = await render(<AnalysisScreen />);
    expect(screen.getByRole("button", { name: "Prüfung, Wird geprüft …" })).toBeTruthy();
    expect(screen.getByText("Arbeitszeit")).toBeTruthy();
    expect(screen.queryByText("Keine sichtbaren Auffälligkeiten")).toBeNull();
    mockCheckError = "Prüfung fehlgeschlagen";
    await screen.rerender(<AnalysisScreen />);
    expect(screen.getByRole("button", { name: "Prüfung, Nicht verfügbar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Gehalt,/ })).toBeTruthy();
  });

  it("opens time premiums for a tariff month without shifts", async () => {
    mockRouteMonth = "2026-09";
    const screen = await render(<SalaryScreen />);
    await fireEvent.press(screen.getByRole("button", { name: /Zeitzuschläge/ }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/premium-details",
      params: { month: "2026-09" },
    });
  });

  it("explains a direct premium link for manual salary without inventing zeros", async () => {
    mockProfile = { ...MOCK_TARIFF_PROFILE, tariff: null, manualMonthlyGrossCents: 320000 };
    const screen = await render(<PremiumDetailsScreen />);
    expect(screen.getByText("Keine tarifliche Berechnung")).toBeTruthy();
    expect(screen.queryByText("0,00 €")).toBeNull();
  });

  it("keeps missing rule coverage local in ComplianceDetailsScreen", async () => {
    await expectRuleCoverageDiagnostic(<ComplianceDetailsScreen />);
  });

  it("keeps January 2027 navigable and shows independent zero values without shifts", async () => {
    const screen = await render(<AnalysisScreen />);

    expectPartialAnalysisShell(screen, false);
    expect(screen.getByLabelText("Ist: 0:00 h")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: /Nächster Monat/ }));

    expect(mockActiveMonthCoordinator.setMonth).toHaveBeenCalledWith("2027-02");
    expect(
      (await render(<WorktimeDetailsScreen />)).getByLabelText(
        "Noch keine Dienste. Trage Dienste ein, um den Monat auszuwerten.",
      ),
    ).toBeTruthy();
  });

  it("keeps January 2027 shift count and worked time visible without holiday coverage", async () => {
    mockEntries = [januaryShift()];

    const screen = await render(<AnalysisScreen />);

    expectPartialAnalysisShell(screen);
    expect(screen.getByLabelText("Ist: 7:30 h")).toBeTruthy();
    await expectShiftCount(1);
    expect(
      (await render(<WorktimeDetailsScreen />)).getByLabelText("Gesamt, Anzahl 1, Stunden 7:30 h"),
    ).toBeTruthy();
  });

  it("keeps manual salary visible without a valid tariff package", async () => {
    mockRouteMonth = "2027-04";
    mockRuleResolver = FUTURE_HOLIDAY_TARIFF_EXPIRY_RESOLVER;
    mockProfile = {
      ...MOCK_TARIFF_PROFILE,
      tariff: null,
      manualMonthlyGrossCents: 345_050,
    };
    mockEntries = [{ ...januaryShift(), id: "april-shift", date: "2027-04-04" }];

    const analysis = await render(<AnalysisScreen />);
    expect(analysis.getByRole("button", { name: /^Gehalt, 3\.450,50/ })).toBeTruthy();

    const salary = await render(<SalaryScreen />);
    expect(salary.queryByText("Diagnosecode: RULE_PACKAGE_NOT_FOUND")).toBeNull();
    expect(salary.getByText("MONATSBRUTTO")).toBeTruthy();
    expect(salary.getByText("Monatsbrutto")).toBeTruthy();
    expect(salary.getByText("Manuell hinterlegt")).toBeTruthy();
    expect(salary.queryByText("Zeitzuschläge")).toBeNull();
  });

  it("does not present missing absence credits as exact zero hours", async () => {
    mockEntries = [
      {
        ...januaryShift(),
        id: "january-vacation",
        type: "VACATION",
        title: "Urlaub",
        startTime: null,
        endTime: null,
        breakMinutes: 0,
      },
    ];

    const screen = await render(<AnalysisScreen />);

    await expectShiftCount(1);
    expect(screen.queryByLabelText("Stunden pro Schicht, Gesamt 0:00 h")).toBeNull();
    expect(screen.getByText(/Abwesenheitsgutschriften benötigen/)).toBeTruthy();
  });

  it("keeps the full April 2027 analysis and marks only expired TVöD pay unavailable", async () => {
    mockRouteMonth = "2027-04";
    mockRuleResolver = FUTURE_HOLIDAY_TARIFF_EXPIRY_RESOLVER;
    mockEntries = [
      {
        ...januaryShift(),
        id: "april-shift",
        date: "2027-04-04",
        title: "Aprildienst",
      },
    ];

    const screen = await render(<AnalysisScreen />);

    expect(screen.getByTestId("analysis-month-toolbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gehalt, Nicht verfügbar/ })).toBeTruthy();
    expect(screen.getByLabelText("Soll: 169:24 h")).toBeTruthy();
    expect(screen.getByLabelText("Ist: 7:30 h")).toBeTruthy();
    expect(screen.getByLabelText("Stundensaldo: −161:54 h")).toBeTruthy();
    await expectShiftCount(1);
    expect(
      (await render(<WorktimeDetailsScreen />)).getByLabelText("Gesamt, Anzahl 1, Stunden 7:30 h"),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps missing rule coverage local in SalaryScreen", async () => {
    await expectRuleCoverageDiagnostic(<SalaryScreen />);
  });

  it("keeps missing rule coverage local in PremiumDetailsScreen", async () => {
    await expectRuleCoverageDiagnostic(<PremiumDetailsScreen />);
  });

  it("keeps tariff assessment independent from missing holiday rules", async () => {
    mockEntries = [januaryShift()];
    const screen = await render(<TariffAssessmentScreen />);

    expect(screen.queryByText("Diagnosecode: RULE_PACKAGE_NOT_FOUND")).toBeNull();
    expect(screen.getByText("Wird dein Arbeitsbereich rund um die Uhr betrieben?")).toBeTruthy();
  });

  it("explains real entries on demand and closes details for a new month", async () => {
    mockRouteMonth = "2026-09";
    mockEntries = ["02", "23", "24"].map((day) => ({
      ...januaryShift(),
      id: day,
      date: `2026-09-${day}`,
      startTime: "21:00",
      endTime: "07:00",
    }));
    const screen = await render(<TariffAssessmentScreen />);
    const name = "Einschätzung erklären";
    expect(screen.getByRole("button", { name, expanded: false })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name }));
    expect(screen.getByText("Passende Nachtdienstfolge gefunden")).toBeTruthy();
    mockEntries = [];
    await screen.rerender(<TariffAssessmentScreen />);
    expect(screen.getByText("Noch keine passende Nachtdienstfolge erkennbar")).toBeTruthy();
    mockRouteMonth = "2026-10";
    await screen.rerender(<TariffAssessmentScreen />);
    expect(screen.getByRole("button", { name, expanded: false })).toBeTruthy();
  });

  it("does not apply the BT-K explanation to another tariff sector", async () => {
    mockProfile = {
      ...MOCK_TARIFF_PROFILE,
      tariff: { ...MOCK_TARIFF_PROFILE.tariff!, sector: "BT_B" },
    };
    const screen = await render(<TariffAssessmentScreen />);
    expect(screen.queryByText("Einschätzung erklären")).toBeNull();
  });

  it("keeps core, salary and holiday worktime independent from missing legal rules", async () => {
    mockRuleResolver = FUTURE_HOLIDAY_MISSING_LEGAL_RESOLVER;
    mockEntries = [januaryShift()];

    const analysis = await render(<AnalysisScreen />);
    expect(analysis.getByLabelText("Ist: 7:30 h")).toBeTruthy();
    expect(analysis.getByLabelText(/^Soll: (?!Nicht verfügbar)/)).toBeTruthy();
    expect(analysis.getByRole("button", { name: /^Gehalt, \d/ })).toBeTruthy();
    expect(analysis.getByText(/Arbeitszeitprüfung benötigt/)).toBeTruthy();

    const salary = await render(<SalaryScreen />);
    expect(salary.queryByText("Diagnosecode: RULE_PACKAGE_NOT_FOUND")).toBeNull();
    expect(salary.getByText("Grundentgelt")).toBeTruthy();
  });

  it("shows expired tariff detail paths as unavailable without zero pseudo-results", async () => {
    mockRouteMonth = "2027-04";
    mockRuleResolver = FUTURE_HOLIDAY_TARIFF_EXPIRY_RESOLVER;
    mockEntries = [{ ...januaryShift(), id: "april-shift", date: "2027-04-04" }];

    const premiums = await render(<PremiumDetailsScreen />);
    expect(
      premiums.getByText("Für diesen Zeitraum liegt kein geprüfter Tarifstand vor."),
    ).toBeTruthy();
    expect(premiums.queryByText("0,00 €")).toBeNull();

    const assessment = await render(<TariffAssessmentScreen />);
    expect(
      assessment.getByText(
        "Die Tarifprüfung ist für diesen Monat ohne gültigen Tarifstand deaktiviert.",
      ),
    ).toBeTruthy();
    expect(assessment.queryByLabelText("Monatswert manuell festlegen")).toBeNull();
    expect(assessment.queryByText("Einschätzung erklären")).toBeNull();
  });

  it.each([
    ["WORK", "/worktime-details"],
    ["CHECK", "/compliance-details"],
    ["PAY", "/salary"],
  ])(
    "opens annual %s month details without changing the parent year",
    async (section, pathname) => {
      mockAnnualSection = section;
      const core = buildAnnualCoreReport(2027, [januaryShift()], mockProfile);
      mockAnnualReportValue = {
        ...core,
        complianceCoverageComplete: true,
        criticalCount: 1,
        months: core.months.map((month, index) => ({
          ...month,
          criticalCount: index === 0 ? 1 : 0,
        })),
      };
      const screen = await render(<AnnualDetailsScreen />);
      await fireEvent.press(screen.getByRole("button", { name: /^Januar 2027,/ }));
      expect(router.push).toHaveBeenLastCalledWith({ pathname, params: { month: "2027-01" } });
      expect(mockActiveMonthCoordinator.setMonth).not.toHaveBeenCalled();
    },
  );

  it("keeps shift counts and hours on the overview and supports existing deep links", async () => {
    mockRouteMonth = "2026-09";
    mockEntries = [{ ...januaryShift(), date: "2026-09-03" }];
    const overview = await render(<AnalysisScreen />);
    expect(overview.queryByRole("button", { name: "Schichten: Details öffnen" })).toBeNull();
    expect(overview.queryByRole("button", { name: /^Stunden,/ })).toBeNull();
    expect(overview.getByLabelText("Gesamt: 7:30 h")).toBeTruthy();
    expect(overview.getByText("D")).toBeTruthy();
    expect(overview.getByLabelText("Sonntagsdienst: 7:30 h")).toBeTruthy();
    await fireEvent.press(overview.getByRole("button", { name: "Schichten: Anzahl" }));
    expect(overview.getByLabelText("Gesamt: 1")).toBeTruthy();
    await overview.unmount();
    mockActiveMonthCoordinator.setMonth.mockClear();
    mockAnnualSection = "SHIFTS";
    const details = await render(<WorktimeDetailsScreen />);
    expect(details.getByText("Deine Schichten")).toBeTruthy();
    expect(details.getByLabelText("Tag, Anzahl 1, Stunden 7:30 h")).toBeTruthy();
    expect(details.queryByText("Arbeitszeit")).toBeNull();
    expect(details.queryByRole("button", { name: "Schichten: Anzahl" })).toBeNull();
    expect(mockActiveMonthCoordinator.setMonth).not.toHaveBeenCalled();
  });

  it("keeps annual shift details and their month destination separate from worktime", async () => {
    mockAnnualSection = "SHIFTS";
    mockAnnualCoreValue = buildAnnualCoreReport(2027, [januaryShift()], mockProfile);
    const screen = await render(<AnnualDetailsScreen />);
    expect(screen.getByLabelText("Tag, Anzahl 1, Stunden 7:30 h")).toBeTruthy();
    expect(screen.queryByText("Arbeitszeit")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Januar 2027: 7:30 h" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/worktime-details",
      params: { month: "2027-01", section: "SHIFTS" },
    });
    expect(mockActiveMonthCoordinator.setMonth).not.toHaveBeenCalled();
  });

  it("rejects incomplete annual links and allows closing", async () => {
    mockAnnualSection = "UNKNOWN";
    const screen = await render(<AnnualDetailsScreen />);
    expect(screen.getByText("Jahresdetails können nicht geöffnet werden")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Schließen" }));
    expect(router.back).toHaveBeenCalled();
  });

  it("keeps pending annual checks and salary out of detail results", async () => {
    mockAnnualCoreValue = buildAnnualCoreReport(2027, [januaryShift()], mockProfile);
    mockAnnualSection = "CHECK";
    const screen = await render(<AnnualDetailsScreen />);
    expect(screen.getByText("Die Jahresprüfung wird berechnet …")).toBeTruthy();
    expect(screen.queryByText(/keine Auffälligkeiten erkannt/)).toBeNull();
    mockAnnualSection = "PAY";
    await screen.rerender(<AnnualDetailsScreen />);
    expect(screen.getByText("Das Jahresgehalt wird berechnet …")).toBeTruthy();
    expect(screen.queryByText("0,00 €")).toBeNull();
  });

  it("keeps year navigation and return to month available while calculating", async () => {
    const screen = await render(<AnalysisScreen />);
    await fireEvent.press(screen.getByLabelText("Jahresauswertung öffnen"));
    expect(screen.getByText("Jahresauswertung wird berechnet …")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Nächstes Jahr, aktuell/));
    expect(screen.getByTestId("analysis-year-toolbar")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Monatsauswertung öffnen"));
    expect(screen.queryByText("Jahresauswertung wird berechnet …")).toBeNull();
  });

  it("renders current core content before the complete annual result", async () => {
    mockAnnualCoreValue = buildAnnualCoreReport(2027, [januaryShift()], mockProfile);
    const screen = await render(<AnalysisScreen />);
    await fireEvent.press(screen.getByLabelText("Jahresauswertung öffnen"));
    expect(screen.queryByText("Jahresauswertung wird berechnet …")).toBeNull();
    expect(screen.getByText("Arbeitszeit")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prüfung, Wird geprüft …" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gehalt, Wird berechnet …" })).toBeTruthy();
    expect(screen.getByLabelText("Ist: 7:30 h")).toBeTruthy();
  });

  it("keeps annual rule coverage local after switching from a covered month", async () => {
    mockRouteMonth = "2026-08";
    const resolution = GENERATION_ONE_REVIEWED_RESOLVER.resolveHoliday("2027-01-01");
    if (resolution.ok) throw new Error("Expected missing 2027 holiday coverage.");
    const error = new RuleResolutionError(resolution.error);
    mockAnnualRuleFailure = { ok: false, error, failure: error.failure };
    const screen = await render(<AnalysisScreen />);

    fireEvent.press(screen.getByLabelText("Jahresauswertung öffnen"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Jahresauswertung nicht verfügbar")).toBeTruthy();
    expect(screen.getByText("Diagnosecode: RULE_PACKAGE_NOT_FOUND")).toBeTruthy();
  });

  it("does not block annual core metrics when input optimization lacks legal rules", async () => {
    mockRuleResolver = FUTURE_HOLIDAY_MISSING_LEGAL_RESOLVER;
    mockEntries = [januaryShift()];
    const resolution = mockRuleResolver.resolveLegal("2027-01-01");
    if (resolution.ok) throw new Error("Expected missing 2027 legal coverage.");
    const error = new RuleResolutionError(resolution.error);
    mockAnnualInputFailure = { ok: false, error, failure: error.failure };
    mockAnnualReportValue = buildAnnualCoreReport(2027, mockEntries, mockProfile);
    const screen = await render(<AnalysisScreen />);

    await fireEvent.press(screen.getByLabelText("Jahresauswertung öffnen"));

    expect(await screen.findByTestId("analysis-year-toolbar")).toBeTruthy();
    expect(screen.getByLabelText("Ist: 7:30 h")).toBeTruthy();
    expect(screen.queryByText("Jahresauswertung nicht verfügbar")).toBeNull();
  });

  it("passes unexpected annual errors to the global boundary", async () => {
    mockRouteMonth = "2026-08";
    mockAnnualFatalError = new Error("unexpected annual render failure");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const screen = await render(
      <AppErrorBoundary>
        <AnalysisScreen />
      </AppErrorBoundary>,
    );

    fireEvent.press(screen.getByLabelText("Jahresauswertung öffnen"));

    expect(await screen.findByText("Diagnosecode: APP_RENDER_FAILED")).toBeTruthy();
    consoleError.mockRestore();
  });

  it("rethrows unexpected computation errors", async () => {
    const unexpectedFailure = "unexpected analysis computation failure";
    mockRuleResolver = {
      ...GENERATION_ONE_REVIEWED_RESOLVER,
      resolveHoliday: () => {
        throw new Error(unexpectedFailure);
      },
    };

    await expect(render(<AnalysisScreen />)).rejects.toThrow(unexpectedFailure);
  });
});

it("opens premiums only inside salary with the exact month", async () => {
  mockRouteMonth = "2026-09";
  mockRuleResolver = GENERATION_ONE_REVIEWED_RESOLVER;
  mockEntries = [];
  mockProfile = MOCK_TARIFF_PROFILE;
  const screen = await render(<AnalysisScreen />);
  expect(screen.queryByRole("button", { name: /^Zeitzuschläge:/ })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: /^Gehalt,/ }));
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: "/salary",
    params: { month: "2026-09" },
  });
  await screen.unmount();
  const salary = await render(<SalaryScreen />);
  await fireEvent.press(salary.getByRole("button", { name: /Zeitzuschläge/ }));
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: "/premium-details",
    params: { month: "2026-09" },
  });
});

async function expectShiftCount(count: number) {
  const screen = await render(<WorktimeDetailsScreen />);
  expect(screen.getByLabelText(new RegExp("^Gesamt, Anzahl " + count + ", Stunden "))).toBeTruthy();
}
