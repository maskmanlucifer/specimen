import fs from 'node:fs/promises';
import path from 'node:path';
import { safePath, type Entry, type StorageAdapter } from './types';

/** A folder on the server's disk. The default for self-hosting and the Docker `/data` volume. */
export class LocalStorage implements StorageAdapter {
  constructor(private readonly root: string) {}

  private abs(p: string) {
    return path.join(this.root, safePath(p));
  }

  async list(dir: string): Promise<Entry[]> {
    try {
      const items = await fs.readdir(this.abs(dir), { withFileTypes: true });
      return Promise.all(
        items
          .filter((d) => !d.name.startsWith('.'))
          .map(async (d) => {
            const st = await fs.stat(path.join(this.abs(dir), d.name));
            return { name: d.name, isDir: d.isDirectory(), size: st.size, modified: st.mtimeMs };
          }),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async read(file: string) {
    try {
      return new Uint8Array(await fs.readFile(this.abs(file)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async write(file: string, data: Uint8Array) {
    const target = this.abs(file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
  }

  async remove(target: string) {
    await fs.rm(this.abs(target), { recursive: true, force: true });
  }

  async usage() {
    const st = await fs.statfs(this.root).catch(() => null);
    let used = 0;
    const walk = async (dir: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else used += (await fs.stat(p)).size;
      }
    };
    await walk(this.root);
    return { used, total: st ? st.blocks * st.bsize : undefined };
  }
}
