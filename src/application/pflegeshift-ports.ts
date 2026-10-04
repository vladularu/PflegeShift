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
import type {
  DatedRemunerationProfile,
  SaveDatedRemunerationProfileInput,
} from "@/domain/remuneration-profile";
import type {
  MonthlyAllowanceDecisions,
  SaveMonthlyAllowanceDecisionsInput,
} from "@/domain/allowance-decisions";

import type {
  SavedOvertimeAllocation,
  SaveOvertimeAllocationInput,
} from "@/domain/overtime-allocation";
import type { SavedPaidAbsence, SavePaidAbsenceInput } from "@/domain/paid-absence";
import type { TrainingRepositoryPort } from "./training-ports";
import type {
  SavedActualOwnAnnualPayment,
  SaveActualOwnAnnualPaymentInput,
} from "@/domain/saved-annual-payment";
import type {
  SavedTariffAnnualClaim,
  SaveTariffAnnualClaimInput,
} from "@/domain/saved-tariff-annual-claim";

import type { SavedTvlShiftWork, SaveTvlShiftWorkInput } from "@/domain/saved-tvl-shift-work";
import type {
  SavedCaritasMonthFacts,
  SaveCaritasMonthFactsInput,
} from "@/domain/saved-caritas-month-facts";
import type {
  SavedTvoedAnnexAMonthConfirmation,
  SaveTvoedAnnexAMonthConfirmationInput,
} from "@/domain/saved-tvoed-annex-a-month-confirmation";
import type {
  SavedDrkEmployeeMonthConfirmation,
  SaveDrkEmployeeMonthConfirmationInput,
} from "@/domain/saved-drk-employee-month-confirmation";
import type {
  SavedDrkTrainingMonthConfirmation,
  SaveDrkTrainingMonthConfirmationInput,
} from "@/domain/saved-drk-training-month-confirmation";
import type {
  SavedTvoedAnnexAPremiumFacts,
  SaveTvoedAnnexAPremiumFactsInput,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import type {
  SavedTvoedSueMonthConfirmation,
  SaveTvoedSueMonthConfirmationInput,
} from "@/domain/saved-tvoed-sue-month-confirmation";
import type {
  SavedTvoedSueAllowanceConfirmation,
  SaveTvoedSueAllowanceConfirmationInput,
} from "@/domain/saved-tvoed-sue-allowance-confirmation";

export interface RemunerationSnapshot {
  readonly drkEmployeeMonthConfirmations: readonly SavedDrkEmployeeMonthConfirmation[];
  readonly drkTrainingMonthConfirmations: readonly SavedDrkTrainingMonthConfirmation[];
  readonly caritasMonthFacts: readonly SavedCaritasMonthFacts[];
  readonly tvoedAnnexAMonthConfirmations: readonly SavedTvoedAnnexAMonthConfirmation[];
  readonly tvoedAnnexAPremiumFacts: readonly SavedTvoedAnnexAPremiumFacts[];
  readonly tvoedSueMonthConfirmations: readonly SavedTvoedSueMonthConfirmation[];
  readonly tvoedSueAllowanceConfirmations: readonly SavedTvoedSueAllowanceConfirmation[];
  readonly tvlShiftWork: readonly SavedTvlShiftWork[];
  readonly tariffAnnualClaims: readonly SavedTariffAnnualClaim[];
  readonly actualAnnualPayments: readonly SavedActualOwnAnnualPayment[];
  readonly paidAbsences: readonly SavedPaidAbsence[];
  readonly profiles: readonly DatedRemunerationProfile[];
  readonly allowanceDecisions: readonly MonthlyAllowanceDecisions[];
  readonly overtimeAllocations: readonly SavedOvertimeAllocation[];
}

export interface RemunerationRepositoryPort {
  readonly saveDrkEmployeeMonthConfirmation: (
    input: SaveDrkEmployeeMonthConfirmationInput,
  ) => Promise<SavedDrkEmployeeMonthConfirmation>;
  readonly saveDrkTrainingMonthConfirmation: (
    input: SaveDrkTrainingMonthConfirmationInput,
  ) => Promise<SavedDrkTrainingMonthConfirmation>;
  readonly saveCaritasMonthFacts: (
    input: SaveCaritasMonthFactsInput,
  ) => Promise<SavedCaritasMonthFacts>;
  readonly saveTvoedAnnexAMonthConfirmation: (
    input: SaveTvoedAnnexAMonthConfirmationInput,
  ) => Promise<SavedTvoedAnnexAMonthConfirmation>;
  readonly saveTvoedAnnexAPremiumFacts: (
    input: SaveTvoedAnnexAPremiumFactsInput,
  ) => Promise<SavedTvoedAnnexAPremiumFacts>;
  readonly saveTvoedSueMonthConfirmation: (
    input: SaveTvoedSueMonthConfirmationInput,
  ) => Promise<SavedTvoedSueMonthConfirmation>;
  readonly saveTvoedSueAllowanceConfirmation: (
    input: SaveTvoedSueAllowanceConfirmationInput,
  ) => Promise<SavedTvoedSueAllowanceConfirmation>;
  readonly saveTvlShiftWork: (input: SaveTvlShiftWorkInput) => Promise<SavedTvlShiftWork>;
  readonly saveTariffAnnualClaim: (
    input: SaveTariffAnnualClaimInput,
  ) => Promise<SavedTariffAnnualClaim>;
  readonly revokeTariffAnnualClaim: (
    expected: SavedTariffAnnualClaim,
  ) => Promise<SavedTariffAnnualClaim>;
  readonly saveActualAnnualPayment: (
    input: SaveActualOwnAnnualPaymentInput,
  ) => Promise<SavedActualOwnAnnualPayment>;
  readonly revokeActualAnnualPayment: (
    expected: SavedActualOwnAnnualPayment,
  ) => Promise<SavedActualOwnAnnualPayment>;
  readonly savePaidAbsence: (input: SavePaidAbsenceInput) => Promise<SavedPaidAbsence>;
  readonly loadSnapshot: () => Promise<RemunerationSnapshot>;
  readonly saveProfile: (
    input: SaveDatedRemunerationProfileInput,
  ) => Promise<DatedRemunerationProfile>;
  readonly saveAllowanceDecisions: (
    input: SaveMonthlyAllowanceDecisionsInput,
  ) => Promise<MonthlyAllowanceDecisions>;
  readonly saveOvertimeAllocation: (
    input: SaveOvertimeAllocationInput,
  ) => Promise<SavedOvertimeAllocation>;
}

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
  readonly training: TrainingRepositoryPort;
  readonly repository: PflegeShiftRepositoryPort;
  readonly remuneration: RemunerationRepositoryPort;
  readonly notifications: PflegeShiftNotificationPort;
  readonly diagnostics: PflegeShiftDiagnosticsPort;
  readonly devTools: PflegeShiftDevToolsPort;
}
