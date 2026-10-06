import { DATA_LOAD_FAILURE_MESSAGE } from "./errors";

const DATA_LOAD_FAILURE_CODES = [
  "LOAD_PROFILE_FAILED",
  "LOAD_TEMPLATES_FAILED",
  "LOAD_CALENDAR_FAILED",
  "LOAD_TARIFF_DECISIONS_FAILED",
  "LOAD_WORK_PATTERN_FAILED",
  "PROFILE_SALARY_INVALID",
  "PROFILE_SALARY_CONFLICT",
] as const;
export type DataLoadFailureCode = (typeof DATA_LOAD_FAILURE_CODES)[number];

/** Fixed codes only; never carry database, JSON or personal error details. */
export class DataLoadFailure extends Error {
  constructor(readonly code: DataLoadFailureCode) {
    super(
      code === "PROFILE_SALARY_CONFLICT"
        ? "Mehrere Gehaltsgrundlagen gespeichert."
        : DATA_LOAD_FAILURE_MESSAGE,
    );
    this.name = "DataLoadFailure";
  }
}

export function dataLoadFailureCode(error: unknown): DataLoadFailureCode | null {
  return error instanceof DataLoadFailure && DATA_LOAD_FAILURE_CODES.includes(error.code)
    ? error.code
    : null;
}

export function dataLoadFailureMessage(error: unknown): string {
  const code = dataLoadFailureCode(error);
  return code ? DATA_LOAD_FAILURE_MESSAGE + "\n\nFehlercode: " + code : DATA_LOAD_FAILURE_MESSAGE;
}

export async function withDataLoadFailureCode<T>(
  code: DataLoadFailureCode,
  read: () => T | Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (dataLoadFailureCode(error) !== null) throw error;
    throw new DataLoadFailure(code);
  }
}
