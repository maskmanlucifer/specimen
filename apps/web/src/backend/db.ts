import Dexie, { type Table } from 'dexie';

/** One file of the "This browser" storage. Big media stays a Blob, so IndexedDB stores it efficiently. */
export interface FileRow {
  path: string;
  data: Blob;
  size: number;
  modified: number;
}

/** Small per-browser records: settings, profile, activity, onboarding state. */
export interface KvRow {
  key: string;
  value: unknown;
}

/**
 * The browser database (IndexedDB through Dexie). Everything a no-account user makes lives here,
 * so it can grow to hundreds of megabytes; `localStorage` holds only tiny preferences.
 */
class SpecimenDB extends Dexie {
  files!: Table<FileRow, string>;
  kv!: Table<KvRow, string>;

  constructor() {
    super('specimen');
    this.version(1).stores({ files: 'path', kv: 'key' });
  }
}

export const db = new SpecimenDB();

/**
 * Reads a small record.
 *
 * @param fallback - Returned when the key is missing.
 */
export async function getKv<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setKv<T>(key: string, value: T): Promise<T> {
  await db.kv.put({ key, value });
  return value;
}
