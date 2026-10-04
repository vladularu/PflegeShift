import { Temporal } from "@js-temporal/polyfill";
import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { resolveRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentTvoedAnnexAPremiumFacts,
  tvoedAnnexAShiftBinding,
  validateSavedTvoedAnnexAPremiumFacts,
  type SavedTvoedAnnexAPremiumFacts,
  type SaveTvoedAnnexAPremiumFactsInput,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import type { ShiftEntry } from "@/domain/types";
import { requireLocalMonth } from "@/domain/validation";
import { listCalendarEntries } from "./calendar-entry-repository";
import { loadProfile } from "./profile-repository";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { withImmediateTransaction } from "./transaction";

export const TVOED_ANNEX_A_PREMIUM_FACTS_COLUMNS = ["month", "facts_json"] as const;
export interface TvoedAnnexAPremiumFactsRow {
  readonly month: string;
  readonly facts_json: string;
}

export function mapTvoedAnnexAPremiumFactsRow(value: unknown): SavedTvoedAnnexAPremiumFacts {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige TVöD-Zuschlagsdaten.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== TVOED_ANNEX_A_PREMIUM_FACTS_COLUMNS.length ||
    TVOED_ANNEX_A_PREMIUM_FACTS_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.facts_json !== "string"
  )
    throw new Error("Ungültige TVöD-Zuschlagsdaten.");
  const parsed = validateSavedTvoedAnnexAPremiumFacts(JSON.parse(row.facts_json));
  if (row.month !== parsed.month) throw new Error("Widersprüchlicher TVöD-Zuschlagsmonat.");
  return parsed;
}

export async function listTvoedAnnexAPremiumFacts(
  db: SQLiteDatabase,
): Promise<readonly SavedTvoedAnnexAPremiumFacts[]> {
  const rows = await db.getAllAsync<TvoedAnnexAPremiumFactsRow>(
    "SELECT month,facts_json FROM tvoed_annex_a_premium_facts ORDER BY month",
  );
  return Object.freeze(rows.map(mapTvoedAnnexAPremiumFactsRow));
}

export async function loadTvoedAnnexAPremiumFacts(
  db: SQLiteDatabase,
  month: string,
): Promise<SavedTvoedAnnexAPremiumFacts | null> {
  const row = await db.getFirstAsync<TvoedAnnexAPremiumFactsRow>(
    "SELECT month,facts_json FROM tvoed_annex_a_premium_facts WHERE month=?",
    requireLocalMonth(month),
  );
  return row === null ? null : mapTvoedAnnexAPremiumFactsRow(row);
}

/** Historical answers may be stale, but may not reference a nonexistent or future profile. */
export function requireTvoedAnnexAPremiumFactsParent(
  value: SavedTvoedAnnexAPremiumFacts,
  profiles: readonly DatedRemunerationProfile[],
): void {
  const profile = profiles.find((item) => item.effectiveFrom === value.profileEffectiveFrom);
  if (!profile || value.profileRevision > profile.revision)
    throw new Error("Ungültige Vergütungsprofilreferenz der TVöD-Zuschlagsdaten.");
  if (value.profileRevision !== profile.revision) return;
  if (!isCurrentTvoedAnnexAPremiumFacts(value, profile, value.ruleVersionId))
    throw new Error("Widersprüchliche TVöD-Zuschlagszuordnung.");
}

export async function saveTvoedAnnexAPremiumFacts(
  db: SQLiteDatabase,
  input: SaveTvoedAnnexAPremiumFactsInput,
): Promise<SavedTvoedAnnexAPremiumFacts> {
  const month = requireLocalMonth(input.month);
  for (const revision of [input.expectedRevision, input.expectedProfileRevision])
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
      throw new Error("Ungültige TVöD-Zuschlagsrevision.");
  const first = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 });
  const last = first.add({ months: 1 }).subtract({ days: 1 });
  return withImmediateTransaction(db, async (tx) => {
    const profiles = await listRemunerationProfiles(tx);
    const profile = profiles.find((item) => item.effectiveFrom === input.profileEffectiveFrom);
    if (
      !profile ||
      profile.revision !== input.expectedProfileRevision ||
      resolveRemunerationProfile(profiles, first.toString()).profile !== profile ||
      resolveRemunerationProfile(profiles, last.toString()).profile !== profile
    )
      throw new ConcurrencyError("Der Vergütungsstand wurde geändert. Bitte neu laden.");
    const selection = profile.data.selection;
    if (
      selection.kind !== "tariff" ||
      selection.packageId !== "tvoed-vka-anlage-a" ||
      !["BT_K", "BT_B"].includes(selection.variant) ||
      selection.region !== "VKA"
    )
      throw new Error("Für diesen Monat ist kein TVöD-Anlage-A-Profil ausgewählt.");
    const workProfile = await loadProfile(tx);
    if (workProfile?.timeZone !== "Europe/Berlin")
      throw new Error("TVöD-Zuschlagsbestätigungen benötigen die Zeitzone Europe/Berlin.");
    const prior = await loadTvoedAnnexAPremiumFacts(tx, month);
    if ((prior?.revision ?? 0) !== input.expectedRevision)
      throw new ConcurrencyError(
        "Die Zuschlagsbestätigung wurde inzwischen geändert. Bitte neu laden.",
      );
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateSavedTvoedAnnexAPremiumFacts({
      month,
      profileEffectiveFrom: input.profileEffectiveFrom,
      profileRevision: profile.revision,
      packageId: "tvoed-vka-anlage-a",
      ruleVersionId: input.ruleVersionId,
      variantId: selection.variant,
      regionId: "VKA",
      groupId: selection.group.toLowerCase(),
      stepId: `s${selection.level}`,
      contractedWeeklyMinutes: profile.data.weeklyMinutes,
      comparableFullTimeWeeklyMinutes: selection.fullTimeWeeklyMinutes,
      timeZoneId: "Europe/Berlin",
      cashPaymentConfirmed: input.cashPaymentConfirmed,
      localAgreement: input.localAgreement,
      dayDecisions: input.dayDecisions,
      revision: input.expectedRevision + 1,
      confirmedAt: prior?.confirmedAt ?? stamp,
      updatedAt: stamp,
    });
    const entries = await listCalendarEntries(
      tx,
      first.subtract({ days: 1 }).toString(),
      last.toString(),
    );
    const shifts = new Map<string, ShiftEntry>(
      entries
        .filter((entry): entry is ShiftEntry => entry.kind === "SHIFT")
        .map((entry) => [entry.id, entry]),
    );
    for (const decision of saved.dayDecisions) {
      const shift = shifts.get(decision.shiftId);
      if (!shift || tvoedAnnexAShiftBinding(shift, "Europe/Berlin") !== decision.shiftBinding)
        throw new ConcurrencyError("Der bestätigte Dienst wurde geändert. Bitte neu laden.");
    }
    await tx.runAsync(
      `INSERT INTO tvoed_annex_a_premium_facts(month,facts_json) VALUES(?,?)
       ON CONFLICT(month) DO UPDATE SET facts_json=excluded.facts_json`,
      month,
      JSON.stringify(saved),
    );
    return saved;
  });
}
