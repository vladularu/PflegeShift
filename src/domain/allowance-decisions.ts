import type { ScopedAllowanceDecision } from "./remuneration-assessment";
import { requireRemunerationDate } from "./remuneration-profile";
import { validateMonthlyTariffDecision } from "./validation";

export type AllowanceDecisionInput = Pick<
  ScopedAllowanceDecision,
  "from" | "through" | "tariff" | "allowanceStatus"
>;

export interface MonthlyAllowanceDecisions {
  readonly month: string;
  /** Zero means never saved. An empty saved month retains its positive revision. */
  readonly revision: number;
  readonly updatedAt: string | null;
  readonly decisions: readonly ScopedAllowanceDecision[];
}

export interface SaveMonthlyAllowanceDecisionsInput {
  readonly month: string;
  readonly expectedRevision: number;
  readonly decisions: readonly AllowanceDecisionInput[];
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Ungültige Zulagenentscheidung.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw new Error("Unbekanntes Format der Zulagenentscheidung.");
  return record;
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u.test(value))
    throw new Error("Die Tarifzuordnung der Zulagenentscheidung fehlt.");
  return value;
}

export function requireAllowanceMonth(month: unknown): string {
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/u.test(month))
    throw new Error("Ungültiger Zulagenmonat.");
  requireRemunerationDate(`${month}-01`);
  return month;
}

/** Shared at calculation, database and backup boundaries; returns immutable copies. */
export function validateScopedAllowanceDecisions(
  value: unknown,
): readonly ScopedAllowanceDecision[] {
  if (!Array.isArray(value)) throw new Error("Ungültige Zulagenentscheidungen.");
  const decisions = value
    .map((item): ScopedAllowanceDecision => {
      const row = exactRecord(item, [
        "from",
        "through",
        "tariff",
        "allowanceStatus",
        "revision",
        "confirmedAt",
        "updatedAt",
      ]);
      const from = requireRemunerationDate(row.from);
      const through = requireRemunerationDate(row.through);
      const tariff = exactRecord(row.tariff, ["packageId", "variant", "region"]);
      if (!Number.isSafeInteger(row.revision)) throw new Error("Ungültige Revision.");
      const validated = validateMonthlyTariffDecision({
        month: from.slice(0, 7),
        allowanceStatus: row.allowanceStatus,
        revision: row.revision,
        confirmedAt: row.confirmedAt,
        updatedAt: row.updatedAt,
      });
      if (from > through || Date.parse(validated.updatedAt) < Date.parse(validated.confirmedAt))
        throw new Error("Ungültiger Zeitraum der Zulagenentscheidung.");
      return Object.freeze({
        from,
        through,
        tariff: Object.freeze({
          packageId: identifier(tariff.packageId),
          variant: identifier(tariff.variant),
          region: identifier(tariff.region),
        }),
        allowanceStatus: validated.allowanceStatus,
        revision: validated.revision,
        confirmedAt: validated.confirmedAt,
        updatedAt: validated.updatedAt,
      });
    })
    .sort((a, b) => a.from.localeCompare(b.from));
  decisions.forEach((decision, index) => {
    if (index > 0 && decisions[index - 1].through >= decision.from)
      throw new Error("Tarifgebundene Zulagenentscheidungen dürfen sich nicht überschneiden.");
  });
  return Object.freeze(decisions);
}
