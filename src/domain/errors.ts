export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class ConcurrencyError extends UserFacingError {
  constructor(message = "Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden.") {
    super(message);
    this.name = "ConcurrencyError";
  }
}

export function userFacingErrorMessage(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback;
}

export const DATA_LOAD_FAILURE_MESSAGE =
  "Lokale Daten konnten nicht geladen werden. Bitte versuche es erneut.";

export const APP_RENDER_FAILURE_MESSAGE =
  "Die Ansicht konnte nicht sicher angezeigt werden. Bitte versuche es erneut.";
