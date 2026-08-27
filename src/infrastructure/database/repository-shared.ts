import { ConcurrencyError } from "@/domain/errors";
import { ValidationError } from "@/domain/validation";

export function parseJson<T>(value: string | null, label: string): T | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new ValidationError(`${label} konnte nicht gelesen werden.`);
  }
}

export function serializeJson(value: object | null | undefined): string | null {
  return value == null ? null : JSON.stringify(value);
}

export async function requireChanged(changes: number): Promise<void> {
  if (changes !== 1) {
    throw new ConcurrencyError();
  }
}
