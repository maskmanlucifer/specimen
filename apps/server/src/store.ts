import fs from 'node:fs/promises';
import path from 'node:path';
import type { HostKind, Settings, StorageKind, User } from '@specimen/schema';

/**
 * Everything the instance itself remembers. There is no database: this is one JSON file
 * in the data dir. It never holds board content, only who can sign in and where boards live.
 */
export interface InstanceState {
  users: (User & { createdAt: number })[];
  sessions: { token: string; userId: string; expires: number }[];
  /** One-time email sign-in tokens. */
  magic: { token: string; email: string; expires: number }[];
  storages: StoredStorage[];
  hosts: StoredHost[];
  settings: Settings;
  onboarded: boolean;
  activity: { at: number; what: string; board: string }[];
}

export interface StoredStorage {
  id: string;
  kind: StorageKind;
  name: string;
  root: string;
  isDefault: boolean;
  account?: string;
  /** Encrypted with {@link seal}. OAuth tokens or access keys, depending on the kind. */
  secret?: string;
  /** Non-secret connection fields (endpoint, bucket, region, local path). */
  config: Record<string, string>;
  /** Set when a refresh fails; the UI shows "Reconnect needed". */
  needsReconnect?: boolean;
}

export interface StoredHost {
  id: string;
  kind: HostKind;
  name: string;
  target: string;
  domain?: string;
  secret?: string;
}

const EMPTY: InstanceState = {
  users: [],
  sessions: [],
  magic: [],
  storages: [],
  hosts: [],
  settings: { defaultVisibility: 'unlisted', theme: 'system', reduceMotion: 'system' },
  onboarded: false,
  activity: [],
};

/**
 * Serialised read-modify-write access to `instance.json`. Writes go to a temp file first and
 * are renamed into place, so a crash never leaves a half-written file.
 */
export class Store {
  private state: InstanceState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'instance.json');
  }

  async read(): Promise<InstanceState> {
    if (!this.state) {
      try {
        this.state = { ...structuredClone(EMPTY), ...JSON.parse(await fs.readFile(this.file, 'utf8')) };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        this.state = structuredClone(EMPTY);
      }
    }
    return this.state!;
  }

  /**
   * Applies `fn` to the state and persists it. Calls are queued so concurrent requests
   * never overwrite each other's changes.
   *
   * @typeParam T - The value `fn` returns.
   */
  update<T>(fn: (s: InstanceState) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const s = await this.read();
      const out = await fn(s);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(s, null, 2));
      await fs.rename(tmp, this.file);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Adds an item to the dashboard's "Recent activity" list (newest first, capped). */
  logActivity(what: string, board: string) {
    return this.update((s) => {
      s.activity.unshift({ at: Date.now(), what, board });
      s.activity.length = Math.min(s.activity.length, 50);
    });
  }
}
