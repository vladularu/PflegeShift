import type { SQLiteDatabase } from "expo-sqlite";

import type {
  CalendarPreferencesData,
  SaveTvoedWorkPatternSettingsInput,
  TvoedAssignment,
  TvoedWorkPatternSettings,
  TvoedWorkplaceCoverage,
} from "@/domain/types";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";

const TVOED_COVERAGE_KEY = "tvoed_workplace_coverage";
const TVOED_ASSIGNMENT_KEY = "tvoed_assignment";

interface PreferenceRow {
  key: string;
  value: string;
  updated_at: string;
}

const CALENDAR_PREFERENCE_KEYS = {
  viewMode: "calendar_view_mode",
  showShifts: "calendar_show_shifts",
  showAppointments: "calendar_show_appointments",
  showHolidays: "calendar_show_holidays",
  labelMode: "calendar_label_mode",
  showShiftTimes: "calendar_show_shift_times",
  showShiftDuration: "calendar_show_shift_duration",
} as const;

export const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferencesData = Object.freeze({
  viewMode: "MONTH",
  showShifts: true,
  showAppointments: true,
  showHolidays: true,
  labelMode: "FULL",
  showShiftTimes: false,
  showShiftDuration: false,
});

function storedBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export async function loadCalendarPreferences(
  db: SQLiteDatabase,
): Promise<CalendarPreferencesData> {
  const keys = Object.values(CALENDAR_PREFERENCE_KEYS);
  const rows = await db.getAllAsync<PreferenceRow>(
    `SELECT key,value,updated_at FROM app_preferences
     WHERE key IN (?,?,?,?,?,?,?)`,
    ...keys,
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const viewMode = values.get(CALENDAR_PREFERENCE_KEYS.viewMode);
  const labelMode = values.get(CALENDAR_PREFERENCE_KEYS.labelMode);
  return Object.freeze({
    viewMode: viewMode === "YEAR" ? "YEAR" : "MONTH",
    showShifts: storedBoolean(
      values.get(CALENDAR_PREFERENCE_KEYS.showShifts),
      DEFAULT_CALENDAR_PREFERENCES.showShifts,
    ),
    showAppointments: storedBoolean(
      values.get(CALENDAR_PREFERENCE_KEYS.showAppointments),
      DEFAULT_CALENDAR_PREFERENCES.showAppointments,
    ),
    showHolidays: storedBoolean(
      values.get(CALENDAR_PREFERENCE_KEYS.showHolidays),
      DEFAULT_CALENDAR_PREFERENCES.showHolidays,
    ),
    labelMode: labelMode === "SYMBOL" ? "SYMBOL" : "FULL",
    showShiftTimes: storedBoolean(
      values.get(CALENDAR_PREFERENCE_KEYS.showShiftTimes),
      DEFAULT_CALENDAR_PREFERENCES.showShiftTimes,
    ),
    showShiftDuration: storedBoolean(
      values.get(CALENDAR_PREFERENCE_KEYS.showShiftDuration),
      DEFAULT_CALENDAR_PREFERENCES.showShiftDuration,
    ),
  });
}

export async function saveCalendarPreferences(
  db: SQLiteDatabase,
  preferences: CalendarPreferencesData,
): Promise<void> {
  const now = new Date().toISOString();
  const values: readonly (readonly [string, string])[] = [
    [CALENDAR_PREFERENCE_KEYS.viewMode, preferences.viewMode],
    [CALENDAR_PREFERENCE_KEYS.showShifts, String(preferences.showShifts)],
    [CALENDAR_PREFERENCE_KEYS.showAppointments, String(preferences.showAppointments)],
    [CALENDAR_PREFERENCE_KEYS.showHolidays, String(preferences.showHolidays)],
    [CALENDAR_PREFERENCE_KEYS.labelMode, preferences.labelMode],
    [CALENDAR_PREFERENCE_KEYS.showShiftTimes, String(preferences.showShiftTimes)],
    [CALENDAR_PREFERENCE_KEYS.showShiftDuration, String(preferences.showShiftDuration)],
  ];
  await withImmediateTransaction(db, async (transaction) => {
    for (const [key, value] of values) {
      await transaction.runAsync(
        `INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
        key,
        value,
        now,
      );
    }
  });
}

function isWorkplaceCoverage(value: string): value is TvoedWorkplaceCoverage {
  return ["UNKNOWN", "AROUND_THE_CLOCK", "NOT_AROUND_THE_CLOCK"].includes(value);
}

function isAssignment(value: string): value is TvoedAssignment {
  return ["UNKNOWN", "PERMANENT", "TEMPORARY"].includes(value);
}

export async function loadTvoedWorkPatternSettings(
  db: SQLiteDatabase,
): Promise<TvoedWorkPatternSettings> {
  const rows = await db.getAllAsync<PreferenceRow>(
    `SELECT key,value,updated_at FROM app_preferences WHERE key IN (?,?)`,
    TVOED_COVERAGE_KEY,
    TVOED_ASSIGNMENT_KEY,
  );
  const coverageRow = rows.find((row) => row.key === TVOED_COVERAGE_KEY);
  const assignmentRow = rows.find((row) => row.key === TVOED_ASSIGNMENT_KEY);
  const workplaceCoverage =
    coverageRow && isWorkplaceCoverage(coverageRow.value) ? coverageRow.value : "UNKNOWN";
  const assignment =
    assignmentRow && isAssignment(assignmentRow.value) ? assignmentRow.value : "UNKNOWN";
  const updatedAt =
    [coverageRow?.updated_at, assignmentRow?.updated_at]
      .filter((value): value is string => typeof value === "string")
      .sort()
      .at(-1) ?? null;
  return Object.freeze({ workplaceCoverage, assignment, updatedAt });
}

export async function saveTvoedWorkPatternSettings(
  db: SQLiteDatabase,
  input: SaveTvoedWorkPatternSettingsInput,
): Promise<TvoedWorkPatternSettings> {
  if (!isWorkplaceCoverage(input.workplaceCoverage) || !isAssignment(input.assignment)) {
    throw new Error("Ungültige Angaben zum Schichtmodell.");
  }
  const now = new Date().toISOString();
  await withImmediateTransaction(db, async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
      TVOED_COVERAGE_KEY,
      input.workplaceCoverage,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
      TVOED_ASSIGNMENT_KEY,
      input.assignment,
      now,
    );
  });
  return loadTvoedWorkPatternSettings(db);
}
