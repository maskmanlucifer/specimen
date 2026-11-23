import { PluginManifest, type InstalledPlugin, type PluginBundle } from '@specimen/schema';
import type { Boards } from './boards';
import { dec, enc, join, safePath, type StorageAdapter } from './files';

const FILES = { manifest: 'plugin.json', script: 'figure.js', style: 'style.css', readme: 'README.md' } as const;

/** Built-in plugins from the repo's `plugins/` folder, bundled into the app at build time. */
const SOURCES = import.meta.glob('../../../../plugins/*/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function builtIns(): Map<string, PluginBundle> {
  const byId = new Map<string, Record<string, string>>();
  for (const [p, text] of Object.entries(SOURCES)) {
    const [id, file] = p.split('/').slice(-2);
    byId.set(id, { ...byId.get(id), [file]: text });
  }
  const out = new Map<string, PluginBundle>();
  for (const [id, f] of byId) {
    if (!f[FILES.manifest]) continue;
    out.set(id, { manifest: PluginManifest.parse(JSON.parse(f[FILES.manifest])), script: f[FILES.script] ?? '', style: f[FILES.style] ?? '', readme: f[FILES.readme] ?? '' });
  }
  return out;
}

const BUILT_IN = builtIns();

/** A built-in plugin only (never a user's own); used by public share pages. */
export const builtInPlugin = (id: string) => BUILT_IN.get(id) ?? null;

/**
 * Plugin sources. User plugins (from the plugin editor) live in the default storage under
 * `plugins/<id>/`, next to the boards, as plain files. A user plugin wins over a built-in
 * with the same id, so a fork can replace a built-in.
 */
export class Plugins {
  constructor(
    private readonly userStorage: () => Promise<StorageAdapter>,
    private readonly boards: Boards,
  ) {}

  private async readUser(id: string): Promise<PluginBundle | null> {
    const a = await this.userStorage();
    const read = async (f: string) => {
      const b = await a.read(join('plugins', safePath(id), f));
      return b ? dec.decode(b) : '';
    };
    const raw = await read(FILES.manifest);
    if (!raw) return null;
    return { manifest: PluginManifest.parse(JSON.parse(raw)), script: await read(FILES.script), style: await read(FILES.style), readme: await read(FILES.readme) };
  }

  async get(id: string): Promise<PluginBundle | null> {
    return (await this.readUser(id).catch(() => null)) ?? builtInPlugin(id);
  }

  async list(): Promise<InstalledPlugin[]> {
    const a = await this.userStorage();
    const userIds = (await a.list('plugins').catch(() => [])).filter((e) => e.isDir).map((e) => e.name);
    const { boards } = await this.boards.list();
    const usage = new Map<string, InstalledPlugin['usedIn']>();
    await Promise.all(
      boards.map(async (s) => {
        const b = await this.boards.get(s.storageId, s.slug).catch(() => null);
        for (const c of b?.cards ?? []) if (c.type === 'figure') usage.set(c.plugin, [...(usage.get(c.plugin) ?? []), { slug: s.slug, title: s.title, caption: c.caption }]);
      }),
    );
    const out: InstalledPlugin[] = [];
    for (const id of new Set([...userIds, ...BUILT_IN.keys()])) {
      const p = await this.get(id).catch(() => null);
      if (p) out.push({ manifest: p.manifest, builtIn: !userIds.includes(id), usedIn: usage.get(id) ?? [] });
    }
    return out.sort((x, y) => x.manifest.name.localeCompare(y.manifest.name));
  }

  /** Saves a user plugin to the default storage. The manifest is validated first. */
  async save(bundle: PluginBundle): Promise<void> {
    const manifest = PluginManifest.parse(bundle.manifest);
    const a = await this.userStorage();
    const dir = join('plugins', manifest.id);
    await a.write(join(dir, FILES.manifest), enc.encode(JSON.stringify(manifest, null, 2)), 'application/json');
    await a.write(join(dir, FILES.script), enc.encode(bundle.script), 'text/javascript');
    await a.write(join(dir, FILES.style), enc.encode(bundle.style), 'text/css');
    if (bundle.readme) await a.write(join(dir, FILES.readme), enc.encode(bundle.readme), 'text/markdown');
  }
}
