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
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ShiftTemplate {
  readonly id: string;
  readonly name: string;
  readonly type: TimedShiftType;
  readonly startTime: string;
  readonly endTime: string;
  readonly breakMinutes: number;
  readonly color: string;
  readonly symbol: string;
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
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly breakMinutes: number;
  readonly color: string;
  readonly symbol: string;
  readonly note: string | null;
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
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export type CalendarEntry = ShiftEntry | Appointment;

export interface MonthlySummaryCategory {
  readonly minutes: number;
  readonly entryCount: number;
}

export interface MonthlySummary {
  readonly month: string;
  readonly targetMinutes: number;
  readonly actualMinutes: number;
  readonly balanceMinutes: number;
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
  readonly type: TimedShiftType;
  readonly startTime: string;
  readonly endTime: string;
  readonly breakMinutes: number;
  readonly color: string;
  readonly symbol: string;
  readonly sortOrder: number;
}

export interface SaveShiftInput {
  readonly id?: string;
  readonly expectedRevision?: number;
  readonly date: string;
  readonly templateId?: string | null;
  readonly title: string;
  readonly type: ShiftType;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly breakMinutes?: number;
  readonly color: string;
  readonly symbol: string;
  readonly note?: string | null;
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
}
