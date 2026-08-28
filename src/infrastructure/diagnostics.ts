export type DiagnosticSource =
  | "app"
  | "database"
  | "dev-tools"
  | "notifications"
  | "preferences"
  | "provider"
  | "reporting"
  | "rule-catalog";

export interface DiagnosticEvent {
  readonly code: string;
  readonly errorClass: string;
  readonly source: DiagnosticSource;
  readonly timestamp: string;
}

const MAX_DIAGNOSTIC_EVENTS = 50;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const SAFE_ERROR_CLASS = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const diagnosticEvents: DiagnosticEvent[] = [];

function sanitizedErrorClass(error: unknown): string {
  if (!(error instanceof Error) || !SAFE_ERROR_CLASS.test(error.name)) {
    return "UnknownError";
  }
  return error.name;
}

export function recordDiagnostic(
  source: DiagnosticSource,
  code: string,
  error: unknown,
): DiagnosticEvent {
  const event = Object.freeze({
    code: SAFE_CODE.test(code) ? code : "INVALID_DIAGNOSTIC_CODE",
    errorClass: sanitizedErrorClass(error),
    source,
    timestamp: new Date().toISOString(),
  });
  diagnosticEvents.push(event);
  if (diagnosticEvents.length > MAX_DIAGNOSTIC_EVENTS) diagnosticEvents.shift();
  if (process.env.NODE_ENV === "development") {
    console.error(`[PflegeShift:${event.code}] ${event.errorClass}`);
  }
  return event;
}

export function listDiagnosticEvents(): readonly DiagnosticEvent[] {
  return Object.freeze([...diagnosticEvents]);
}

export function clearDiagnosticEvents(): void {
  diagnosticEvents.length = 0;
}
