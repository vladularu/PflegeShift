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
  ["default-early", "Früh", "EARLY", "06:00", "14:12", 30, "#7E57C2", "F", 10],
  ["default-late", "Spät", "LATE", "13:18", "21:30", 30, "#2FA36B", "S", 20],
  ["default-night", "Nacht", "NIGHT", "21:00", "07:30", 60, "#EA5B55", "N", 30],
  ["default-day", "Tag", "DAY", "08:00", "16:12", 30, "#2F80ED", "T", 40],
] as const;

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
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
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
    await addColumnIfMissing(
      db,
      "user_profile",
      "full_time_weekly_minutes",
      "INTEGER",
    );
    await addColumnIfMissing(
      db,
      "shift_entries",
      "overtime_minutes",
      "INTEGER NOT NULL DEFAULT 0",
    );
    await addColumnIfMissing(
      db,
      "shift_entries",
      "holiday_premium_mode",
      "TEXT NOT NULL DEFAULT 'WITH_TIME_OFF'",
    );
    await db.execAsync(MIGRATION_2);
    await db.runAsync(
      "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
      2,
      now,
    );
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
}
