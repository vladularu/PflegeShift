import { Temporal } from "@js-temporal/polyfill";

import type {
  AllowanceStatus,
  FederalState,
  SaveAppointmentInput,
  SaveShiftInput,
  TestRunRequest,
} from "@/domain/types";
import { validateAppointment, validateShift } from "@/domain/validation";
import { getPublicHolidays } from "@/engine/holidays";

export interface GeneratedTestPlan {
  readonly months: readonly string[];
  readonly shifts: readonly SaveShiftInput[];
  readonly appointments: readonly SaveAppointmentInput[];
  readonly decisions: readonly { month: string; allowanceStatus: AllowanceStatus }[];
  readonly warnings: readonly string[];
}

const SHIFTS = {
  early: {
    title: "Früh",
    type: "EARLY",
    startTime: "06:00",
    endTime: "14:12",
    breakMinutes: 30,
    color: "#7E57C2",
    symbol: "F",
  },
  late: {
    title: "Spät",
    type: "LATE",
    startTime: "13:18",
    endTime: "21:30",
    breakMinutes: 30,
    color: "#2FA36B",
    symbol: "S",
  },
  night: {
    title: "Nacht",
    type: "NIGHT",
    startTime: "21:00",
    endTime: "07:30",
    breakMinutes: 60,
    color: "#EA5B55",
    symbol: "N",
  },
  day: {
    title: "Tag",
    type: "DAY",
    startTime: "08:00",
    endTime: "16:12",
    breakMinutes: 30,
    color: "#2F80ED",
    symbol: "T",
  },
} as const;

function datesInMonth(month: string): Temporal.PlainDate[] {
  const value = Temporal.PlainYearMonth.from(month);
  return Array.from({ length: value.daysInMonth }, (_, index) =>
    value.toPlainDate({ day: index + 1 }),
  );
}

function shift(
  date: string,
  preset: keyof typeof SHIFTS,
  extra: Partial<SaveShiftInput> = {},
): SaveShiftInput {
  return validateShift({ date, ...SHIFTS[preset], ...extra });
}

function absence(
  date: string,
  type: "VACATION" | "SICK" | "FREE",
  title: string,
  color: string,
  symbol: string,
): SaveShiftInput {
  return validateShift({ date, title, type, color, symbol, breakMinutes: 0 });
}

function appointment(date: string, index: number, allDay = false): SaveAppointmentInput {
  return validateAppointment({
    date,
    title: allDay ? "Ganztägiger Termin" : `Termin ${index + 1}`,
    allDay,
    startTime: allDay ? null : index % 2 === 0 ? "10:00" : "17:00",
    endTime: allDay ? null : index % 2 === 0 ? "10:45" : "18:00",
    color: index % 2 === 0 ? "#D97706" : "#0891B2",
    note: "Automatisch vom Testlabor erzeugt",
  });
}

function normalMonth(
  month: string,
  shifts: SaveShiftInput[],
  appointments: SaveAppointmentInput[],
) {
  const days = datesInMonth(month);
  const rotation = ["early", "early", "late", "late", "FREE", "night", "FREE"] as const;
  days.forEach((date, index) => {
    if (index === 10) {
      shifts.push(
        shift(date.toString(), "day", {
          title: "Fortbildung",
          type: "TRAINING",
          color: "#8B5CF6",
          symbol: "FB",
        }),
      );
    } else if (index === 18 || index === 19) {
      shifts.push(absence(date.toString(), "VACATION", "Urlaub", "#0EA5E9", "U"));
    } else {
      const value = rotation[index % rotation.length];
      if (value === "FREE") shifts.push(absence(date.toString(), "FREE", "Frei", "#64748B", "–"));
      else shifts.push(shift(date.toString(), value));
    }
    if (index % 9 === 4) appointments.push(appointment(date.toString(), index));
  });
}

function premiumMonth(
  month: string,
  federalState: FederalState,
  shifts: SaveShiftInput[],
  appointments: SaveAppointmentInput[],
  warnings: string[],
) {
  const days = datesInMonth(month);
  const holidays = new Set(
    getPublicHolidays(days[0].year, federalState)
      .filter((item) => item.date.startsWith(`${month}-`))
      .map((item) => item.date),
  );
  let premiumCalendarDay = false;
  days.forEach((date, index) => {
    const key = date.toString();
    if (holidays.has(key)) {
      shifts.push(
        shift(key, "day", {
          overtimeMinutes: 60,
          holidayPremiumMode: "WITHOUT_TIME_OFF",
          note: "Feiertagszuschlag testen",
        }),
      );
      premiumCalendarDay = true;
    } else if (date.month === 12 && (date.day === 24 || date.day === 31)) {
      shifts.push(shift(key, "day", { overtimeMinutes: 30, note: "Vorfestzuschlag testen" }));
      premiumCalendarDay = true;
    } else if (date.dayOfWeek === 7) {
      shifts.push(shift(key, "day", { overtimeMinutes: index % 2 === 0 ? 60 : 0 }));
    } else if (date.dayOfWeek === 6) {
      shifts.push(shift(key, "late"));
    } else if (date.dayOfWeek === 1) {
      shifts.push(shift(key, "night", { overtimeMinutes: index % 2 === 0 ? 45 : 0 }));
    }
    if (index % 8 === 2) appointments.push(appointment(key, index));
  });
  if (!premiumCalendarDay)
    warnings.push(`${month}: Kein Feiertag oder Vorfest im gewählten Monat.`);
}

function complianceMonth(month: string, shifts: SaveShiftInput[]) {
  const dates = datesInMonth(month).map(String);
  const add = (day: number, preset: keyof typeof SHIFTS, extra: Partial<SaveShiftInput> = {}) => {
    const date = dates[Math.min(day - 1, dates.length - 1)];
    shifts.push(shift(date, preset, extra));
  };
  add(1, "day", {
    title: "Über 10 Stunden",
    startTime: "06:00",
    endTime: "18:30",
    breakMinutes: 30,
  });
  add(3, "day", { title: "Pause zu kurz", startTime: "07:00", endTime: "16:30", breakMinutes: 15 });
  add(5, "late", { title: "Überschneidung A", endTime: "22:00" });
  add(5, "night", { title: "Überschneidung B", startTime: "21:00" });
  add(8, "late", { endTime: "23:00" });
  add(9, "early", { startTime: "05:30" });
  for (let day = 12; day <= 19; day++) add(day, "day", { title: `Arbeitsserie ${day - 11}` });
  for (let day = 21; day <= 25; day++) add(day, "night", { title: `Nachtserie ${day - 20}` });
}

function stressMonth(
  month: string,
  shifts: SaveShiftInput[],
  appointments: SaveAppointmentInput[],
) {
  datesInMonth(month).forEach((date, index) => {
    const key = date.toString();
    shifts.push(shift(key, "early", { title: `Früh ${index + 1}` }));
    shifts.push(shift(key, "late", { title: `Spät ${index + 1}` }));
    shifts.push(
      index % 4 === 0
        ? absence(key, "VACATION", "Urlaub", "#0EA5E9", "U")
        : shift(key, "night", { title: `Nacht ${index + 1}` }),
    );
    appointments.push(appointment(key, index));
    appointments.push(appointment(key, index + 100, true));
  });
}

export function generateTestPlan(
  request: TestRunRequest,
  federalState: FederalState,
): GeneratedTestPlan {
  const start = Temporal.PlainYearMonth.from(request.startMonth);
  const months = Array.from({ length: request.range }, (_, index) =>
    start.add({ months: index }).toString(),
  );
  const shifts: SaveShiftInput[] = [];
  const appointments: SaveAppointmentInput[] = [];
  const decisions: { month: string; allowanceStatus: AllowanceStatus }[] = [];
  const warnings: string[] = [];

  months.forEach((month) => {
    if (request.scenario === "NORMAL_ROTATION") {
      normalMonth(month, shifts, appointments);
    } else if (request.scenario === "PREMIUM_MONTH") {
      premiumMonth(month, federalState, shifts, appointments, warnings);
    } else if (request.scenario === "COMPLIANCE_CASES") {
      complianceMonth(month, shifts);
    } else {
      stressMonth(month, shifts, appointments);
    }
  });

  return Object.freeze({
    months: Object.freeze(months),
    shifts: Object.freeze(shifts),
    appointments: Object.freeze(appointments),
    decisions: Object.freeze(decisions),
    warnings: Object.freeze(warnings),
  });
}
