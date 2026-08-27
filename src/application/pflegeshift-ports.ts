import type {
  Appointment,
  CalendarEntry,
  MonthlyTariffDecision,
  SaveAppointmentInput,
  SaveMonthlyTariffDecisionInput,
  SaveProfileInput,
  SaveShiftInput,
  SaveShiftTemplateInput,
  SaveTvoedWorkPatternSettingsInput,
  ShiftEntry,
  ShiftTemplate,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";

export interface PflegeShiftRepositoryPort {
  readonly loadProfile: () => Promise<UserProfile | null>;
  readonly saveProfile: (input: SaveProfileInput) => Promise<UserProfile>;
  readonly listTemplates: () => Promise<readonly ShiftTemplate[]>;
  readonly saveTemplate: (input: SaveShiftTemplateInput) => Promise<ShiftTemplate>;
  readonly deleteTemplate: (id: string, expectedRevision: number) => Promise<void>;
  readonly restoreTemplate: (template: ShiftTemplate) => Promise<ShiftTemplate>;
  readonly swapTemplateSortOrder: (
    first: ShiftTemplate,
    second: ShiftTemplate,
  ) => Promise<readonly [ShiftTemplate, ShiftTemplate]>;
  readonly listCalendarEntries: (
    startDate?: string,
    endDate?: string,
  ) => Promise<readonly CalendarEntry[]>;
  readonly saveShift: (input: SaveShiftInput) => Promise<ShiftEntry>;
  readonly saveAppointment: (input: SaveAppointmentInput) => Promise<Appointment>;
  readonly deleteCalendarEntry: (entry: CalendarEntry) => Promise<void>;
  readonly restoreCalendarEntry: (entry: CalendarEntry) => Promise<CalendarEntry>;
  readonly listMonthlyTariffDecisions: () => Promise<readonly MonthlyTariffDecision[]>;
  readonly saveMonthlyTariffDecision: (
    input: SaveMonthlyTariffDecisionInput,
  ) => Promise<MonthlyTariffDecision>;
  readonly loadTvoedWorkPatternSettings: () => Promise<TvoedWorkPatternSettings>;
  readonly saveTvoedWorkPatternSettings: (
    input: SaveTvoedWorkPatternSettingsInput,
  ) => Promise<TvoedWorkPatternSettings>;
}

export interface PflegeShiftNotificationPort {
  readonly syncEntry: (entry: CalendarEntry, timeZone: string) => Promise<void>;
  readonly cancelEntry: (entry: Pick<CalendarEntry, "id" | "kind">) => Promise<void>;
}

export type PflegeShiftDiagnosticSource = "dev-tools" | "notifications" | "provider";

export interface PflegeShiftDiagnosticsPort {
  readonly record: (source: PflegeShiftDiagnosticSource, code: string, error: unknown) => void;
}

export interface PflegeShiftDevToolsPort {
  readonly shouldLoadState: (ready: boolean, revision: number) => boolean;
  readonly listBackupMonths: () => Promise<readonly string[]>;
}

export interface PflegeShiftPorts {
  readonly repository: PflegeShiftRepositoryPort;
  readonly notifications: PflegeShiftNotificationPort;
  readonly diagnostics: PflegeShiftDiagnosticsPort;
  readonly devTools: PflegeShiftDevToolsPort;
}
