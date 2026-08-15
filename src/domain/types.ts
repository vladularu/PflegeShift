export const FEDERAL_STATES = [
  "BW",
  "BY",
  "BE",
  "BB",
  "HB",
  "HH",
  "HE",
  "MV",
  "NI",
  "NW",
  "RP",
  "SL",
  "SN",
  "ST",
  "SH",
  "TH",
] as const;

export type FederalState = (typeof FEDERAL_STATES)[number];

export const FEDERAL_STATE_LABELS: Readonly<Record<FederalState, string>> = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

export const SHIFT_TYPES = [
  "EARLY",
  "LATE",
  "NIGHT",
  "DAY",
  "TRAINING",
  "VACATION",
  "SICK",
  "FREE",
  "CUSTOM",
] as const;

export type ShiftType = (typeof SHIFT_TYPES)[number];
export type TimedShiftType = Exclude<ShiftType, "VACATION" | "SICK" | "FREE">;
export type AbsenceShiftType = "VACATION" | "SICK";

export const PAY_GROUPS = [
  "P7",
  "P8",
  "P9",
  "P10",
  "P11",
  "P12",
  "P13",
  "P14",
  "P15",
  "P16",
] as const;
export type PayGroup = (typeof PAY_GROUPS)[number];
export const PAY_LEVELS = [2, 3, 4, 5, 6] as const;
export type PayLevel = (typeof PAY_LEVELS)[number];
export type TariffSector = "BT_K" | "BT_B";
export type HolidayPremiumMode = "WITH_TIME_OFF" | "WITHOUT_TIME_OFF";
export const ALLOWANCE_STATUSES = [
  "NONE",
  "SHIFT_MONTHLY",
  "SHIFT_HOURLY",
  "ALTERNATING_MONTHLY",
  "ALTERNATING_HOURLY",
] as const;
export type AllowanceStatus = (typeof ALLOWANCE_STATUSES)[number];

export interface TariffProfile {
  readonly payGroup: PayGroup;
  readonly payLevel: PayLevel;
  readonly sector: TariffSector;
  readonly fullTimeWeeklyMinutes: number;
}

export const SHIFT_TYPE_LABELS: Readonly<Record<ShiftType, string>> = {
  EARLY: "Früh",
  LATE: "Spät",
  NIGHT: "Nacht",
  DAY: "Tag",
  TRAINING: "Fortbildung",
  VACATION: "Urlaub",
  SICK: "Krank",
  FREE: "Frei",
  CUSTOM: "Dienst",
};

export interface UserProfile {
  readonly federalState: FederalState;
  readonly weeklyMinutes: number;
  readonly timeZone: string;
  readonly tariff: TariffProfile | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const RECURRENCE_FREQUENCIES = ["DAY", "WEEK", "MONTH", "YEAR"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export interface RecurrenceRule {
  readonly interval: number;
  readonly frequency: RecurrenceFrequency;
}

export const NOTIFICATION_UNITS = ["MINUTE", "HOUR", "DAY", "WEEK"] as const;
export type NotificationUnit = (typeof NOTIFICATION_UNITS)[number];
export type NotificationDirection = "BEFORE" | "AFTER";
export type NotificationReference = "START" | "END";

export interface EntryNotification {
  readonly amount: number;
  readonly unit: NotificationUnit;
  readonly direction: NotificationDirection;
  readonly reference: NotificationReference;
}

export interface EntryLocation {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface ShiftTemplate {
  readonly id: string;
  readonly name: string;
  readonly type: ShiftType;
  readonly allDay?: boolean;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly breakMinutes: number;
  readonly color: string;
  readonly symbol: string;
  readonly notification?: EntryNotification | null;
  readonly location?: EntryLocation | null;
  readonly sortOrder: number;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface ShiftEntry {
  readonly kind: "SHIFT";
  readonly id: string;
  readonly date: string;
  readonly templateId: string | null;
  readonly title: string;
  readonly type: ShiftType;
  readonly allDay?: boolean;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly breakMinutes: number;
  readonly color: string;
  readonly symbol: string;
  readonly note: string | null;
  readonly notification?: EntryNotification | null;
  readonly location?: EntryLocation | null;
  readonly overtimeMinutes: number;
  readonly holidayPremiumMode: HolidayPremiumMode;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface Appointment {
  readonly kind: "APPOINTMENT";
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly allDay: boolean;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly color: string;
  readonly note: string | null;
  readonly recurrence?: RecurrenceRule | null;
  readonly notification?: EntryNotification | null;
  readonly location?: EntryLocation | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export type CalendarEntry = ShiftEntry | Appointment;

export type CalendarViewMode = "MONTH" | "YEAR";
export type CalendarLabelMode = "FULL" | "SYMBOL";

export interface CalendarPreferencesData {
  readonly viewMode: CalendarViewMode;
  readonly showShifts: boolean;
  readonly showAppointments: boolean;
  readonly showHolidays: boolean;
  readonly labelMode: CalendarLabelMode;
  readonly showShiftTimes: boolean;
  readonly showShiftDuration: boolean;
}

export interface MonthlySummaryCategory {
  readonly minutes: number;
  readonly entryCount: number;
}

export interface MonthlySummary {
  readonly month: string;
  readonly targetMinutes: number;
  readonly actualMinutes: number;
  readonly balanceMinutes: number;
  readonly overlapMinutes: number;
  readonly work: MonthlySummaryCategory;
  readonly training: MonthlySummaryCategory;
  readonly vacation: MonthlySummaryCategory;
  readonly sick: MonthlySummaryCategory;
  readonly free: MonthlySummaryCategory;
}

export interface SaveShiftTemplateInput {
  readonly id?: string;
  readonly expectedRevision?: number;
  readonly name: string;
  readonly type: ShiftType;
  readonly allDay?: boolean;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly breakMinutes: number;
  readonly color: string;
  readonly symbol: string;
  readonly notification?: EntryNotification | null;
  readonly location?: EntryLocation | null;
  readonly sortOrder: number;
}

export interface SaveShiftInput {
  readonly id?: string;
  readonly expectedRevision?: number;
  readonly date: string;
  readonly templateId?: string | null;
  readonly title: string;
  readonly type: ShiftType;
  readonly allDay?: boolean;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly breakMinutes?: number;
  readonly color: string;
  readonly symbol: string;
  readonly note?: string | null;
  readonly notification?: EntryNotification | null;
  readonly location?: EntryLocation | null;
  readonly overtimeMinutes?: number;
  readonly holidayPremiumMode?: HolidayPremiumMode;
}

export interface MonthlyTariffDecision {
  readonly month: string;
  readonly allowanceStatus: AllowanceStatus;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveMonthlyTariffDecisionInput {
  readonly month: string;
  readonly allowanceStatus: AllowanceStatus;
  readonly expectedRevision?: number;
}

export interface SaveProfileInput {
  readonly federalState: FederalState;
  readonly weeklyMinutes: number;
  readonly timeZone: string;
  readonly tariff?: TariffProfile | null;
}

export type ComplianceSeverity = "info" | "warning" | "critical";
export type ComplianceKind = "LEGAL" | "PLANNING";

export interface ComplianceIssue {
  readonly id: string;
  readonly severity: ComplianceSeverity;
  readonly kind: ComplianceKind;
  readonly rule: string;
  readonly title: string;
  readonly description: string;
  readonly relatedShiftIds: readonly string[];
  readonly date: string;
}

export interface MonthlyComplianceResult {
  readonly month: string;
  readonly issues: readonly ComplianceIssue[];
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly affectedDates: readonly string[];
}

export interface PremiumLine {
  readonly key: string;
  readonly label: string;
  readonly minutes: number;
  readonly percentage: number;
  readonly hourlyRate: number;
  readonly amount: number;
}

export interface ShiftPremiumBreakdown {
  readonly shiftId: string;
  readonly date: string;
  readonly netMinutes: number;
  readonly premiumLines: readonly PremiumLine[];
  readonly overtimeBaseAmount: number;
  readonly overtimePremiumAmount: number;
  readonly totalAmount: number;
}

export interface TvoedAssessment {
  readonly shiftWork: "DETECTED" | "REVIEW" | "NOT_DETECTED";
  readonly alternatingShiftWork: "DETECTED" | "REVIEW" | "NOT_DETECTED";
  readonly suggestedAllowance: AllowanceStatus;
  readonly evidence: readonly string[];
  readonly criteria: readonly TvoedAssessmentCriterion[];
  readonly requiresConfirmation: boolean;
}

export type TvoedWorkplaceCoverage = "UNKNOWN" | "AROUND_THE_CLOCK" | "NOT_AROUND_THE_CLOCK";
export type TvoedAssignment = "UNKNOWN" | "PERMANENT" | "TEMPORARY";

export interface TvoedWorkPatternSettings {
  readonly workplaceCoverage: TvoedWorkplaceCoverage;
  readonly assignment: TvoedAssignment;
  readonly updatedAt: string | null;
}

export interface SaveTvoedWorkPatternSettingsInput {
  readonly workplaceCoverage: TvoedWorkplaceCoverage;
  readonly assignment: TvoedAssignment;
}

export interface TvoedAssessmentCriterion {
  readonly key: "SHIFT_CHANGES" | "NIGHT_SHIFTS" | "AROUND_THE_CLOCK" | "ASSIGNMENT";
  readonly label: string;
  readonly detail: string;
  readonly state: "MET" | "OPEN" | "NOT_MET";
}

export interface MonthlyPayEstimate {
  readonly month: string;
  readonly tariffLabel: string | null;
  readonly available: boolean;
  readonly fullTimeTableAmount: number | null;
  readonly personalBaseAmount: number | null;
  readonly shiftBreakdowns: readonly ShiftPremiumBreakdown[];
  readonly timePremiumAmount: number;
  readonly overtimeAmount: number;
  readonly allowanceAmount: number;
  readonly tvoedAllowanceAmount: number;
  readonly careAllowanceAmount: number;
  readonly estimatedGrossAmount: number | null;
  readonly assessment: TvoedAssessment;
  readonly confirmedAllowance: AllowanceStatus | null;
}

export interface SaveAppointmentInput {
  readonly id?: string;
  readonly expectedRevision?: number;
  readonly date: string;
  readonly title: string;
  readonly allDay: boolean;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly color: string;
  readonly note?: string | null;
  readonly recurrence?: RecurrenceRule | null;
  readonly notification?: EntryNotification | null;
  readonly location?: EntryLocation | null;
}

export const TEST_SCENARIOS = [
  "NORMAL_ROTATION",
  "PREMIUM_MONTH",
  "COMPLIANCE_CASES",
  "UI_STRESS",
] as const;

export type TestScenario = (typeof TEST_SCENARIOS)[number];
export type TestRange = 1 | 3 | 12;

export interface TestRunRequest {
  readonly startMonth: string;
  readonly range: TestRange;
  readonly scenario: TestScenario;
}

export interface TestRunPreview {
  readonly request: TestRunRequest;
  readonly months: readonly string[];
  readonly existingEntryCount: number;
  readonly plannedShiftCount: number;
  readonly plannedAppointmentCount: number;
  readonly plannedDecisionCount: number;
  readonly backedUpMonths: readonly string[];
  readonly warnings: readonly string[];
}

export interface TestRunResult {
  readonly runId: string;
  readonly months: readonly string[];
  readonly shiftCount: number;
  readonly appointmentCount: number;
}

export interface TestBackupSummary {
  readonly month: string;
  readonly runId: string;
  readonly createdAt: string;
  readonly currentEntryCount: number;
}
