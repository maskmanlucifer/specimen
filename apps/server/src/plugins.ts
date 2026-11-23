import fs from 'node:fs/promises';
import path from 'node:path';
import { PluginManifest, type InstalledPlugin, type PluginBundle } from '@specimen/schema';
import type { Boards } from './boards';
import type { StorageRegistry } from './storage/registry';
import { dec, enc, join, safePath } from './storage/types';

const FILES = { manifest: 'plugin.json', script: 'figure.js', style: 'style.css', readme: 'README.md' } as const;

/**
 * Plugin sources. Built-ins ship in the repo's `plugins/` folder. User plugins (made in the
 * plugin editor) live in the default storage under `plugins/<id>/`, next to the boards.
 * Both are plain folders: plugin.json, figure.js, style.css, README.md. No build step.
 */
export class Plugins {
  constructor(
    private readonly builtInDir: string,
    private readonly storages: StorageRegistry,
    private readonly boards: Boards,
  ) {}

  private async readBuiltIn(id: string): Promise<PluginBundle | null> {
    const dir = path.join(this.builtInDir, safePath(id));
    const read = (f: string) => fs.readFile(path.join(dir, f), 'utf8').catch(() => '');
    const raw = await read(FILES.manifest);
    if (!raw) return null;
    return { manifest: PluginManifest.parse(JSON.parse(raw)), script: await read(FILES.script), style: await read(FILES.style), readme: await read(FILES.readme) };
  }

  private async userAdapter() {
    const def = (await this.storages.all()).find((s) => s.isDefault);
    return def ? this.storages.adapter(def.id) : null;
  }

  private async readUser(id: string): Promise<PluginBundle | null> {
    const a = await this.userAdapter();
    if (!a) return null;
    const read = async (f: string) => {
      const b = await a.read(join('plugins', safePath(id), f));
      return b ? dec.decode(b) : '';
    };
    const raw = await read(FILES.manifest);
    if (!raw) return null;
    return { manifest: PluginManifest.parse(JSON.parse(raw)), script: await read(FILES.script), style: await read(FILES.style), readme: await read(FILES.readme) };
  }

  /** User plugins win over built-ins with the same id, so a fork can replace a built-in. */
  async get(id: string): Promise<PluginBundle | null> {
    return (await this.readUser(id).catch(() => null)) ?? (await this.readBuiltIn(id));
  }

  async list(): Promise<InstalledPlugin[]> {
    const builtInIds = (await fs.readdir(this.builtInDir, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);
    const a = await this.userAdapter();
    const userIds = a ? (await a.list('plugins').catch(() => [])).filter((e) => e.isDir).map((e) => e.name) : [];
    const { boards } = await this.boards.list();
    const usage = new Map<string, InstalledPlugin['usedIn']>();
    await Promise.all(
      boards.map(async (s) => {
        const b = await this.boards.get(s.storageId, s.slug).catch(() => null);
        for (const c of b?.cards ?? []) if (c.type === 'figure') usage.set(c.plugin, [...(usage.get(c.plugin) ?? []), { slug: s.slug, title: s.title, caption: c.caption }]);
      }),
    );
    const out: InstalledPlugin[] = [];
    for (const id of new Set([...userIds, ...builtInIds])) {
      const p = await this.get(id).catch(() => null);
      if (p) out.push({ manifest: p.manifest, builtIn: !userIds.includes(id), usedIn: usage.get(id) ?? [] });
    }
    return out.sort((x, y) => x.manifest.name.localeCompare(y.manifest.name));
  }

  /** Saves a user plugin to the default storage. The manifest is validated first. */
  async save(bundle: PluginBundle): Promise<void> {
    const manifest = PluginManifest.parse(bundle.manifest);
    const a = await this.userAdapter();
    if (!a) throw new Error('Connect a storage first');
    const dir = join('plugins', manifest.id);
    await a.write(join(dir, FILES.manifest), enc.encode(JSON.stringify(manifest, null, 2)), 'application/json');
    await a.write(join(dir, FILES.script), enc.encode(bundle.script), 'text/javascript');
    await a.write(join(dir, FILES.style), enc.encode(bundle.style), 'text/css');
    if (bundle.readme) await a.write(join(dir, FILES.readme), enc.encode(bundle.readme), 'text/markdown');
  }
}
