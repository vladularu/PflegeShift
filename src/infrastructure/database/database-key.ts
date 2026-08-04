const DATABASE_KEY_BYTES = 32;
const DATABASE_KEY_PATTERN = /^[0-9a-f]{64}$/;

export interface DatabaseKeyStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

function assertDatabaseKey(value: string): string {
  const normalized = value.toLowerCase();
  if (!DATABASE_KEY_PATTERN.test(normalized)) {
    throw new Error("Der gespeicherte Datenbankschlüssel ist ungültig.");
  }
  return normalized;
}

function bytesToHex(bytes: Uint8Array): string {
  if (bytes.byteLength !== DATABASE_KEY_BYTES) {
    throw new Error("Der erzeugte Datenbankschlüssel hat eine ungültige Länge.");
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function readDatabaseKey(store: DatabaseKeyStore): Promise<string | null> {
  const value = await store.get();
  return value === null ? null : assertDatabaseKey(value);
}

export async function createDatabaseKey(
  store: DatabaseKeyStore,
  randomBytes: (length: number) => Promise<Uint8Array>,
): Promise<string> {
  const key = bytesToHex(await randomBytes(DATABASE_KEY_BYTES));
  await store.set(key);
  return key;
}

export function sqlCipherKeyLiteral(key: string): string {
  return `"x'${assertDatabaseKey(key)}'"`;
}

export function sqliteStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
