import type { SQLiteDatabase } from "expo-sqlite";

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'singleton'),
  federal_state TEXT NOT NULL,
  weekly_minutes INTEGER NOT NULL CHECK (weekly_minutes BETWEEN 60 AND 4800),
  time_zone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shift_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('EARLY','LATE','NIGHT','DAY','TRAINING','CUSTOM')),
  start_time TEXT NOT NULL CHECK (length(start_time) = 5),
  end_time TEXT NOT NULL CHECK (length(end_time) = 5),
  break_minutes INTEGER NOT NULL CHECK (break_minutes BETWEEN 0 AND 1440),
  color TEXT NOT NULL CHECK (length(color) = 7),
  symbol TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS shift_entries (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL CHECK (length(date) = 10),
  template_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  type TEXT NOT NULL CHECK (type IN ('EARLY','LATE','NIGHT','DAY','TRAINING','VACATION','SICK','FREE','CUSTOM')),
  start_time TEXT,
  end_time TEXT,
  break_minutes INTEGER NOT NULL CHECK (break_minutes BETWEEN 0 AND 1440),
  color TEXT NOT NULL CHECK (length(color) = 7),
  symbol TEXT NOT NULL,
  note TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (template_id) REFERENCES shift_templates(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (type IN ('VACATION','SICK','FREE') AND start_time IS NULL AND end_time IS NULL AND break_minutes = 0)
    OR
    (type IN ('EARLY','LATE','NIGHT','DAY','TRAINING','CUSTOM') AND length(start_time) = 5 AND length(end_time) = 5 AND start_time <> end_time)
  )
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL CHECK (length(date) = 10),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  all_day INTEGER NOT NULL CHECK (all_day IN (0,1)),
  start_time TEXT,
  end_time TEXT,
  color TEXT NOT NULL CHECK (length(color) = 7),
  note TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (
    (all_day = 1 AND start_time IS NULL AND end_time IS NULL)
    OR
    (all_day = 0 AND length(start_time) = 5 AND length(end_time) = 5 AND end_time > start_time)
  )
);

CREATE INDEX IF NOT EXISTS idx_shift_entries_date_active
  ON shift_entries(date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_date_active
  ON appointments(date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shift_templates_order_active
  ON shift_templates(sort_order) WHERE deleted_at IS NULL;
`;

const DEFAULT_TEMPLATES = [
  ["default-early", "Früh", "EARLY", "06:00", "14:12", 30, "#4FCB68", "rise", 10],
  ["default-late", "Spät", "LATE", "13:18", "21:30", 30, "#F05C68", "sun", 20],
  ["default-night", "Nacht", "NIGHT", "21:00", "07:30", 60, "#F2A93B", "moon", 30],
  ["default-day", "Tag", "DAY", "08:00", "16:12", 30, "#31A7C3", "home", 40],
  ["default-vacation", "Urlaub", "VACATION", null, null, 0, "#858A8E", "palm", 50],
  ["default-sick", "Krank", "SICK", null, null, 0, "#F09A3E", "med", 60],
  ["default-free", "Frei", "FREE", null, null, 0, "#858A8E", "star", 70],
] as const;

const DEFAULT_APPEARANCE_UPDATES = [
  ["default-early", "#7E57C2", "#4FCB68", "F", "rise"],
  ["default-late", "#2FA36B", "#F05C68", "S", "sun"],
  ["default-night", "#EA5B55", "#F2A93B", "N", "moon"],
  ["default-day", "#2F80ED", "#31A7C3", "T", "home"],
  ["default-vacation", "#25A9A4", "#858A8E", "U", "palm"],
  ["default-sick", "#F09A3E", "#F09A3E", "K", "med"],
  ["default-free", "#8A9490", "#858A8E", "–", "star"],
] as const;

const MIGRATION_4 = `
BEGIN IMMEDIATE;
CREATE TABLE shift_templates_v4 (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('EARLY','LATE','NIGHT','DAY','TRAINING','VACATION','SICK','FREE','CUSTOM')),
  start_time TEXT,
  end_time TEXT,
  break_minutes INTEGER NOT NULL CHECK (break_minutes BETWEEN 0 AND 1440),
  color TEXT NOT NULL CHECK (length(color) = 7),
  symbol TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (
    (type IN ('VACATION','SICK','FREE') AND start_time IS NULL AND end_time IS NULL AND break_minutes = 0)
    OR
    (type IN ('EARLY','LATE','NIGHT','DAY','TRAINING','CUSTOM') AND length(start_time) = 5 AND length(end_time) = 5 AND start_time <> end_time)
  )
);
INSERT INTO shift_templates_v4(
  id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
  revision,created_at,updated_at,deleted_at
)
SELECT id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
  revision,created_at,updated_at,deleted_at
FROM shift_templates;
DROP TABLE shift_templates;
ALTER TABLE shift_templates_v4 RENAME TO shift_templates;
CREATE INDEX idx_shift_templates_order_active
  ON shift_templates(sort_order) WHERE deleted_at IS NULL;
COMMIT;
`;

const MIGRATION_2 = `
CREATE TABLE IF NOT EXISTS monthly_tariff_decisions (
  month TEXT PRIMARY KEY NOT NULL CHECK (length(month) = 7),
  allowance_status TEXT NOT NULL CHECK (allowance_status IN (
    'NONE','SHIFT_MONTHLY','SHIFT_HOURLY','ALTERNATING_MONTHLY','ALTERNATING_HOURLY'
  )),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  confirmed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const MIGRATION_3 = `
CREATE TABLE IF NOT EXISTS app_preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dev_test_backups (
  month TEXT PRIMARY KEY NOT NULL CHECK (length(month) = 7),
  payload TEXT NOT NULL,
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_entries_test_run
  ON shift_entries(test_run_id);
CREATE INDEX IF NOT EXISTS idx_appointments_test_run
  ON appointments(test_run_id);
CREATE INDEX IF NOT EXISTS idx_dev_test_backups_run
  ON dev_test_backups(run_id);
`;

const MIGRATION_6 = `
CREATE INDEX IF NOT EXISTS idx_shift_entries_deleted_at
  ON shift_entries(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_deleted_at
  ON appointments(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shift_templates_deleted_at
  ON shift_templates(deleted_at) WHERE deleted_at IS NOT NULL;
`;

const MIGRATION_7 = `
CREATE TABLE IF NOT EXISTS scheduled_entry_notifications (
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('SHIFT','APPOINTMENT')),
  entry_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL CHECK (length(occurrence_date) = 10),
  notification_id TEXT NOT NULL,
  PRIMARY KEY (entry_kind, entry_id, occurrence_date, notification_id)
);
CREATE INDEX IF NOT EXISTS idx_scheduled_entry_notifications_entry
  ON scheduled_entry_notifications(entry_kind, entry_id);
`;

async function addColumnIfMissing(
  db: SQLiteDatabase,
  table: string,
  column: string,
  declaration: string,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;",
  );
  await db.execAsync(MIGRATION_1);
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)",
    1,
    now,
  );

  const migration2 = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version=2",
  );
  if (migration2 === null) {
    await addColumnIfMissing(db, "user_profile", "pay_group", "TEXT");
    await addColumnIfMissing(db, "user_profile", "pay_level", "INTEGER");
    await addColumnIfMissing(db, "user_profile", "tariff_sector", "TEXT");
    await addColumnIfMissing(db, "user_profile", "full_time_weekly_minutes", "INTEGER");
    await addColumnIfMissing(db, "shift_entries", "overtime_minutes", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(
      db,
      "shift_entries",
      "holiday_premium_mode",
      "TEXT NOT NULL DEFAULT 'WITH_TIME_OFF'",
    );
    await db.execAsync(MIGRATION_2);
    await db.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 2, now);
  }

  const migration3 = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version=3",
  );
  if (migration3 === null) {
    await addColumnIfMissing(db, "shift_entries", "test_run_id", "TEXT");
    await addColumnIfMissing(db, "appointments", "test_run_id", "TEXT");
    await db.execAsync(MIGRATION_3);
    await db.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 3, now);
  }

  const migration4 = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version=4",
  );
  if (migration4 === null) {
    const templateColumns = await db.getAllAsync<{ name: string; notnull: number }>(
      "PRAGMA table_info(shift_templates)",
    );
    const startTimeColumn = templateColumns.find((column) => column.name === "start_time");
    if (startTimeColumn?.notnull === 1) {
      await db.execAsync("PRAGMA foreign_keys = OFF;");
      try {
        await db.execAsync(MIGRATION_4);
      } finally {
        await db.execAsync("PRAGMA foreign_keys = ON;");
      }
    }
    await db.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 4, now);
  }

  for (const template of DEFAULT_TEMPLATES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO shift_templates(
        id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
        revision,created_at,updated_at,deleted_at
      ) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,NULL)`,
      ...template,
      now,
      now,
    );
  }
  await db.runAsync(
    `UPDATE shift_entries SET template_id=CASE type
      WHEN 'VACATION' THEN 'default-vacation'
      WHEN 'SICK' THEN 'default-sick'
      WHEN 'FREE' THEN 'default-free'
      ELSE template_id END
     WHERE template_id IS NULL AND type IN ('VACATION','SICK','FREE')`,
  );

  const migration5 = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version=5",
  );
  if (migration5 === null) {
    await db.runAsync(
      "UPDATE shift_templates SET symbol=? WHERE id='default-free' AND symbol=?",
      "–",
      "\u00e2\u20ac\u201c",
    );
    await db.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 5, now);
  }

  const migration6 = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version=6",
  );
  if (migration6 === null) {
    await db.execAsync(MIGRATION_6);
    await db.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 6, now);
  }

  const migration7 = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version=7",
  );
  if (migration7 === null) {
    await addColumnIfMissing(db, "shift_templates", "notification_json", "TEXT");
    await addColumnIfMissing(db, "shift_templates", "location_json", "TEXT");
    await addColumnIfMissing(db, "shift_templates", "all_day", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, "shift_entries", "notification_json", "TEXT");
    await addColumnIfMissing(db, "shift_entries", "location_json", "TEXT");
    await addColumnIfMissing(db, "shift_entries", "all_day", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, "appointments", "recurrence_frequency", "TEXT");
    await addColumnIfMissing(db, "appointments", "recurrence_interval", "INTEGER");
    await addColumnIfMissing(db, "appointments", "notification_json", "TEXT");
    await addColumnIfMissing(db, "appointments", "location_json", "TEXT");
    await db.execAsync(MIGRATION_7);
    await db.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 7, now);
  }

  const migration8 = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version=8",
  );
  if (migration8 === null) {
    for (const [id, oldColor, nextColor, oldSymbol, nextSymbol] of DEFAULT_APPEARANCE_UPDATES) {
      if (oldColor !== nextColor) {
        await db.runAsync(
          `UPDATE shift_templates
             SET color=?, revision=revision+1, updated_at=?
           WHERE id=? AND color=?`,
          nextColor,
          now,
          id,
          oldColor,
        );
      }
      await db.runAsync(
        `UPDATE shift_templates
           SET symbol=?, revision=revision+1, updated_at=?
         WHERE id=? AND symbol=?`,
        nextSymbol,
        now,
        id,
        oldSymbol,
      );
    }
    await db.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 8, now);
  }

  const migration9 = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version=9",
  );
  if (migration9 === null) {
    await addColumnIfMissing(
      db,
      "shift_entries",
      "alarm_enabled",
      "INTEGER NOT NULL DEFAULT 0 CHECK (alarm_enabled IN (0,1))",
    );
    await db.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 9, now);
  }
}
