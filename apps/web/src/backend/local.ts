import { db } from './db';
import { join, mimeOf, safePath, type Entry, type StorageAdapter } from './files';

/**
 * "This browser": boards in IndexedDB. Folders are implied by paths, as in an object store.
 * Data stays on this device only, so the app offers export and import next to it.
 */
export class BrowserStorage implements StorageAdapter {
  async list(dir: string): Promise<Entry[]> {
    const prefix = dir ? `${safePath(dir)}/` : '';
    const rows = await db.files.where('path').startsWith(prefix).toArray();
    const out = new Map<string, Entry>();
    for (const r of rows) {
      const rest = r.path.slice(prefix.length);
      const [name, ...more] = rest.split('/');
      const isDir = more.length > 0;
      const prev = out.get(name);
      out.set(name, { name, isDir: isDir || !!prev?.isDir, size: (prev?.size ?? 0) + (isDir ? 0 : r.size), modified: Math.max(prev?.modified ?? 0, r.modified) });
    }
    return [...out.values()];
  }

  async read(file: string) {
    const row = await db.files.get(safePath(file));
    return row ? new Uint8Array(await row.data.arrayBuffer()) : null;
  }

  /** Reads a file as a Blob with its type, for media without a copy into memory. */
  async blob(file: string): Promise<Blob | null> {
    return (await db.files.get(safePath(file)))?.data ?? null;
  }

  async write(file: string, data: Uint8Array | Blob, contentType = mimeOf(file)) {
    const blob = data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>], { type: contentType });
    await db.files.put({ path: safePath(file), data: blob, size: blob.size, modified: Date.now() });
  }

  async remove(target: string) {
    const p = safePath(target);
    await db.transaction('rw', db.files, async () => {
      await db.files.delete(p);
      await db.files.where('path').startsWith(`${p}/`).delete();
    });
  }

  async usage() {
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    return { used: est?.usage ?? 0, total: est?.quota };
  }

  /** Every file path, for "Export everything". */
  async all(): Promise<string[]> {
    return (await db.files.toCollection().primaryKeys()).map(String).map((p) => join(p));
  }
}
