import { Temporal } from "@js-temporal/polyfill";
import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import {
  type AllowanceDecisionInput,
  type MonthlyAllowanceDecisions,
  type SaveMonthlyAllowanceDecisionsInput,
  requireAllowanceMonth,
  validateScopedAllowanceDecisions,
} from "@/domain/allowance-decisions";
import { resolveRemunerationProfile } from "@/domain/remuneration-profile";
import { requireInstant, requirePositiveRevision } from "@/domain/validation";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { withImmediateTransaction } from "./transaction";

export const ALLOWANCE_DECISION_COLUMNS = [
  "month",
  "decisions_json",
  "revision",
  "updated_at",
] as const;

export interface AllowanceDecisionRow {
  readonly month: string;
  readonly decisions_json: string;
  readonly revision: number;
  readonly updated_at: string;
}

export function mapAllowanceDecisionRow(row: AllowanceDecisionRow): MonthlyAllowanceDecisions {
  const month = requireAllowanceMonth(row.month);
  if (!Number.isSafeInteger(row.revision)) throw new Error("Ungültige Zulagenrevision.");
  const revision = requirePositiveRevision(row.revision);
  const updatedAt = requireInstant(row.updated_at, "Aktualisierung");
  const decisions = validateScopedAllowanceDecisions(JSON.parse(row.decisions_json) as unknown);
  if (
    decisions.some(
      (decision) =>
        decision.from.slice(0, 7) !== month ||
        decision.through.slice(0, 7) !== month ||
        decision.revision !== revision ||
        decision.updatedAt !== updatedAt,
    )
  )
    throw new Error("Die Zulagenentscheidungen passen nicht zum gespeicherten Monat.");
  return Object.freeze({ month, revision, updatedAt, decisions });
}

export async function loadMonthlyAllowanceDecisions(
  db: SQLiteDatabase,
  month: string,
): Promise<MonthlyAllowanceDecisions> {
  requireAllowanceMonth(month);
  const row = await db.getFirstAsync<AllowanceDecisionRow>(
    `SELECT ${ALLOWANCE_DECISION_COLUMNS.join(",")} FROM scoped_allowance_decisions WHERE month=?`,
    month,
  );
  return row === null
    ? Object.freeze({ month, revision: 0, updatedAt: null, decisions: Object.freeze([]) })
    : mapAllowanceDecisionRow(row);
}

export async function listMonthlyAllowanceDecisions(
  db: SQLiteDatabase,
): Promise<readonly MonthlyAllowanceDecisions[]> {
  const rows = await db.getAllAsync<AllowanceDecisionRow>(
    `SELECT ${ALLOWANCE_DECISION_COLUMNS.join(",")} FROM scoped_allowance_decisions ORDER BY month`,
  );
  return Object.freeze(rows.map(mapAllowanceDecisionRow));
}

export class AllowanceDecisionConflictError extends ConcurrencyError {
  constructor() {
    super("Die Zulagenbestätigungen wurden inzwischen geändert. Bitte neu laden.");
    this.name = "AllowanceDecisionConflictError";
  }
}

function coversSameDecision(left: AllowanceDecisionInput, right: AllowanceDecisionInput): boolean {
  return (
    left.from <= right.from &&
    left.through >= right.through &&
    left.allowanceStatus === right.allowanceStatus &&
    left.tariff.packageId === right.tariff.packageId &&
    left.tariff.variant === right.tariff.variant &&
    left.tariff.region === right.tariff.region
  );
}

/** Replaces one month's complete set; even clearing retains its revision (no ABA reset). */
export async function saveMonthlyAllowanceDecisions(
  db: SQLiteDatabase,
  input: SaveMonthlyAllowanceDecisionsInput,
): Promise<MonthlyAllowanceDecisions> {
  const month = requireAllowanceMonth(input.month);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new Error("Ungültige Zulagenrevision.");
  // Snapshot untrusted/mutable input before the first await.
  const revision = input.expectedRevision + 1;
  const stamp = new Date().toISOString();
  const candidates = validateScopedAllowanceDecisions(
    input.decisions.map((decision) => ({
      ...decision,
      revision,
      confirmedAt: stamp,
      updatedAt: stamp,
    })),
  );
  if (
    candidates.some(
      (decision) => decision.from.slice(0, 7) !== month || decision.through.slice(0, 7) !== month,
    )
  )
    throw new Error("Zulagenbestätigungen müssen innerhalb des gewählten Monats liegen.");
  return withImmediateTransaction(db, async (transaction) => {
    const previous = await loadMonthlyAllowanceDecisions(transaction, month);
    if (previous.revision !== revision - 1) throw new AllowanceDecisionConflictError();
    const history = await listRemunerationProfiles(transaction);
    if (history.length === 0) throw new Error("Bitte zuerst ein Vergütungsprofil anlegen.");
    for (const decision of candidates) {
      for (
        let day = Temporal.PlainDate.from(decision.from);
        day.toString() <= decision.through;
        day = day.add({ days: 1 })
      ) {
        const resolved = resolveRemunerationProfile(history, day.toString());
        const selection = resolved.status === "dated" ? resolved.profile.data.selection : null;
        if (
          selection?.kind !== "tariff" ||
          selection.packageId !== decision.tariff.packageId ||
          selection.variant !== decision.tariff.variant ||
          selection.region !== decision.tariff.region
        )
          throw new Error(
            "Die Tarifzuordnung hat sich geändert. Bitte Vergütung und Zeitraum prüfen.",
          );
      }
    }
    const updatedAt = new Date(
      Math.max(Date.now(), previous.updatedAt === null ? 0 : Date.parse(previous.updatedAt)),
    ).toISOString();
    const decisions = candidates.map((candidate) => ({
      ...candidate,
      updatedAt,
      confirmedAt:
        previous.decisions.find((decision) => coversSameDecision(decision, candidate))
          ?.confirmedAt ?? updatedAt,
    }));
    const saved = mapAllowanceDecisionRow({
      month,
      decisions_json: JSON.stringify(decisions),
      revision,
      updated_at: updatedAt,
    });
    await transaction.runAsync(
      `INSERT INTO scoped_allowance_decisions(month,decisions_json,revision,updated_at)
       VALUES(?,?,?,?) ON CONFLICT(month) DO UPDATE SET
       decisions_json=excluded.decisions_json,revision=excluded.revision,updated_at=excluded.updated_at`,
      month,
      JSON.stringify(saved.decisions),
      revision,
      updatedAt,
    );
    return saved;
  });
}
