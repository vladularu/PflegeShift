/** Only for isolated test databases: remove every reviewed remuneration table at/after a migration. */
export function rewindRemunerationMigrations(
  database: { exec(sql: string): unknown },
  firstVersion: number,
): void {
  if (!Number.isInteger(firstVersion) || firstVersion < 14 || firstVersion > 31)
    throw new Error("Unsupported remuneration fixture migration.");
  const tables = [
    [31, "drk_training_month_confirmations"],
    [30, "drk_employee_month_confirmations"],
    [29, "tvoed_annex_a_premium_facts"],
    [28, "tvoed_sue_allowance_confirmations"],
    [27, "tvoed_sue_month_confirmations"],
    [26, "tvoed_annex_a_month_confirmations"],
    [25, "caritas_overtime"],
    [24, "caritas_month_facts"],
    [23, "caritas_work_days"],
    [22, "tvl_shift_work"],
    [21, "tariff_annual_claims"],
    [20, "actual_annual_payments"],
    [19, "shift_training_details"],
    [19, "training_profiles"],
    [18, "paid_absences"],
    [17, "overtime_allocations"],
    [16, "scoped_allowance_decisions"],
    [14, "remuneration_profiles"],
  ] as const;
  for (const [version, table] of tables)
    if (version >= firstVersion) database.exec("DROP TABLE IF EXISTS " + table);
  database.exec("DELETE FROM schema_migrations WHERE version >= " + firstVersion);
}
