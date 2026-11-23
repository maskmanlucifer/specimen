import { zipSync, type Zippable } from 'fflate';
import { CARD_LABEL, cardText, hostOf, uid, type ActivityItem, type Board, type BoardResponse, type PluginBundle, type PublishRequest, type PublishResult, type Session, type Settings, type StorageInfo, type User } from '@specimen/schema';
import { Boards } from './boards';
import { cloudConfig, cloudSession, disconnectGoogle, driveToken, signOut } from './cloud';
import { db, getKv, setKv } from './db';
import { DriveStorage } from './drive';
import { dec, join, safePath, type StorageAdapter } from './files';
import { readImport } from './importer';
import { BrowserStorage } from './local';
import { builtInPlugin, Plugins } from './plugins';
import { Publisher, type SharedBoard } from './publish';

export { ConflictError } from './boards';
export { ReconnectError } from './files';

const VERSION = '0.2.0';

const browser = new BrowserStorage();
const drive = new DriveStorage(driveToken);

/** Signed in with Google through the user's own Supabase project. */
async function signedIn() {
  return (await cloudSession().catch(() => null)) !== null;
}

async function storageIds(): Promise<string[]> {
  return (await signedIn()) ? ['gdrive', 'local'] : ['local'];
}

/**
 * @throws An Error with `status: 404` for an unknown storage, or Google Drive while signed out.
 */
async function adapter(id: string): Promise<BrowserStorage | DriveStorage> {
  if (id === 'local') return browser;
  if (id === 'gdrive' && (await signedIn())) return drive;
  throw Object.assign(new Error(id === 'gdrive' ? 'Sign in with Google to open Drive boards' : `Unknown storage ${id}`), { status: 404 });
}

/** New boards and user plugins go to Drive when signed in, else to this browser. */
const defaultId = async () => ((await signedIn()) ? 'gdrive' : 'local');

const boards = new Boards(adapter, storageIds);
const plugins = new Plugins(async () => adapter(await defaultId()), boards);

async function mediaBlob(sid: string, slug: string, path: string): Promise<Blob | null> {
  return (await adapter(sid)).blob(join(safePath(slug), safePath(path)));
}

async function readMedia(sid: string, slug: string, path: string) {
  const b = await mediaBlob(sid, slug, path);
  return b ? new Uint8Array(await b.arrayBuffer()) : null;
}

const publisher = new Publisher(boards, plugins, readMedia);

// ---------- Per-browser records ----------

const DEFAULT_SETTINGS: Settings = { defaultVisibility: 'unlisted', theme: 'system', reduceMotion: 'system' };
type Profile = Pick<User, 'name' | 'handle' | 'bio'>;

async function logActivity(what: string, board: string) {
  const list = await getKv<ActivityItem[]>('activity', []);
  await setKv('activity', [{ at: Date.now(), what, board }, ...list].slice(0, 30));
}

async function storageInfo(id: string, usage = false): Promise<StorageInfo> {
  const s = id === 'gdrive' ? await cloudSession().catch(() => null) : null;
  const a = await adapter(id);
  const base: StorageInfo =
    id === 'gdrive'
      ? { id, kind: 'gdrive', name: 'Google Drive', root: '/Specimen', isDefault: true, status: 'ok', account: s?.user.email ?? undefined }
      : { id, kind: 'local', name: 'This browser', root: 'IndexedDB', isDefault: !(await signedIn()), status: 'ok' };
  if (usage) base.usage = await a.usage?.().catch(() => undefined);
  return base;
}

// ---------- Uploads ----------

/** Parts of in-progress uploads, kept in memory until the last part arrives. */
const parts = new Map<string, { blobs: Blob[]; received: number }>();

// ---------- Downloads ----------

/** Saves bytes as a file through the browser's download. */
export function download(name: string, data: Uint8Array | Blob, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

async function zipFolder(a: StorageAdapter, root: string, prefix: string, out: Zippable) {
  for (const e of await a.list(root)) {
    const p = join(root, e.name);
    if (e.isDir) await zipFolder(a, p, join(prefix, e.name), out);
    else {
      const data = await a.read(p);
      if (data) out[join(prefix, e.name)] = data;
    }
  }
}

/** The browser back-end: everything the Node server did, against IndexedDB or Google Drive. */
export const backend = {
  version: VERSION,

  async session(): Promise<Session> {
    const s = await cloudSession().catch(() => null);
    const profile = await getKv<Profile>('profile', { name: 'You', handle: 'me' });
    const meta = (s?.user.user_metadata ?? {}) as { full_name?: string; name?: string };
    const user: User = s
      ? { id: s.user.id, name: profile.name !== 'You' ? profile.name : (meta.full_name ?? meta.name ?? s.user.email ?? 'You'), handle: profile.handle, bio: profile.bio, email: s.user.email, methods: [{ kind: 'google', label: s.user.email ?? 'Google' }] }
      : { id: 'local', ...profile, methods: [] };
    return { user, authMode: s ? 'hosted' : 'none', version: VERSION, providers: { google: !!cloudConfig(), github: false, dropbox: false, onedrive: false, email: false }, dataDir: '', onboarded: await getKv('onboarded', false) };
  },
  signOut,
  disconnectGoogle,
  async updateMe(patch: Partial<Profile>): Promise<User> {
    const cur = await getKv<Profile>('profile', { name: 'You', handle: 'me' });
    const next = { ...cur, ...patch, ...(patch.handle !== undefined ? { handle: patch.handle.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) } : {}) };
    await setKv('profile', next);
    return (await this.session()).user!;
  },
  async finishOnboarding() {
    await setKv('onboarded', true);
  },

  settings: () => getKv<Settings>('settings', DEFAULT_SETTINGS),
  async updateSettings(patch: Partial<Settings>) {
    return setKv('settings', { ...(await getKv<Settings>('settings', DEFAULT_SETTINGS)), ...patch });
  },
  activity: async () => (await getKv<ActivityItem[]>('activity', [])).slice(0, 12),

  /** Searches card text, transcripts and code across every board (⌘K on the dashboard). */
  async search(query: string) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: { storageId: string; slug: string; board: string; cardId?: string; label: string; text: string }[] = [];
    for (const s of (await boards.list()).boards) {
      if (s.title.toLowerCase().includes(q)) hits.push({ storageId: s.storageId, slug: s.slug, board: s.title, label: 'Board', text: s.title });
      const b = await boards.get(s.storageId, s.slug).catch(() => null);
      for (const card of b?.cards ?? []) {
        const text = cardText(card);
        const i = text.toLowerCase().indexOf(q);
        if (i >= 0) hits.push({ storageId: s.storageId, slug: s.slug, board: s.title, cardId: card.id, label: CARD_LABEL[card.type], text: text.slice(Math.max(0, i - 30), i + 70) });
      }
    }
    return hits.slice(0, 40);
  },

  async storages(usage = false) {
    return Promise.all((await storageIds()).map((id) => storageInfo(id, usage)));
  },

  boards: () => boards.list(),
  async createBoard(title: string, storageId?: string, template?: string) {
    const sid = storageId ?? (await defaultId());
    const board = await boards.create(sid, title.trim() || 'Untitled board', (await this.session()).user?.name, template);
    await logActivity('Created board', board.title);
    return { storageId: sid, board };
  },
  async board(sid: string, slug: string): Promise<BoardResponse> {
    return { board: await boards.get(sid, slug), storage: await storageInfo(sid) };
  },
  async saveBoard(sid: string, slug: string, board: Board, baseRev: number, force = false) {
    return { board: await boards.save(sid, slug, board, baseRev, force) };
  },
  async moveBoard(sid: string, slug: string, to: string) {
    const board = await boards.move(sid, slug, to);
    await logActivity(`Moved to ${to === 'gdrive' ? 'Google Drive' : 'this browser'}`, board.title);
    return { storageId: to, board };
  },
  async deleteBoard(sid: string, slug: string) {
    const b = await boards.get(sid, slug).catch(() => null);
    await boards.remove(sid, slug);
    if (b) await logActivity('Deleted board', b.title);
  },
  boardFiles: (sid: string, slug: string) => boards.files(sid, slug),
  mediaBlob,

  /**
   * Chunked upload: parts arrive in order with `offset`; the last part stores the file.
   * Parts can be resent after a pause, so uploads resume.
   */
  async uploadPart(sid: string, slug: string, q: { id: string; name: string; offset: number; total: number }, part: Blob, type: string) {
    const st = parts.get(q.id) ?? { blobs: [], received: 0 };
    if (q.offset === 0) Object.assign(st, { blobs: [], received: 0 });
    if (q.offset === st.received) {
      st.blobs.push(part);
      st.received += part.size;
    }
    parts.set(q.id, st);
    if (st.received < q.total) return { received: st.received };
    parts.delete(q.id);
    const file = new Blob(st.blobs, { type });
    const src = await boards.putMedia(sid, slug, q.name, file, type);
    return { received: q.total, src, size: file.size };
  },
  uploadStatus: async (_sid: string, _slug: string, id: string) => ({ received: parts.get(id)?.received ?? 0 }),

  /** Downloads one board as `<slug>.zip`: board.json and media/, the open format. */
  async exportBoard(sid: string, slug: string) {
    const out: Zippable = {};
    await zipFolder(await adapter(sid), slug, slug, out);
    download(`${slug}.zip`, zipSync(out), 'application/zip');
  },

  /** Downloads every board and plugin in this browser as one zip. */
  async exportBrowser() {
    const out: Zippable = {};
    await zipFolder(browser, '', 'specimen', out);
    download(`specimen-${new Date().toISOString().slice(0, 10)}.zip`, zipSync(out), 'application/zip');
    await setKv('exportedAt', Date.now());
  },
  lastExport: () => getKv<number | null>('exportedAt', null),

  async importBoard(file: File, storageId?: string) {
    const { board, media } = readImport(file.name, new Uint8Array(await file.arrayBuffer()));
    const sid = storageId ?? (await defaultId());
    const slug = await boards.freeSlug(sid, board.slug || 'imported');
    const a = await adapter(sid);
    for (const [p, data] of media) await a.write(join(slug, safePath(p)), data);
    const saved = { ...board, slug, rev: 1, updatedAt: Date.now() };
    await boards.write(sid, saved);
    await logActivity('Imported', saved.title);
    return { storageId: sid, board: saved };
  },

  /** Deletes everything this browser stores: boards, media, plugins, settings. Drive is not touched. */
  async clearBrowser() {
    await db.delete();
    localStorage.removeItem('specimen-rt');
    location.reload();
  },

  plugins: () => plugins.list(),
  async plugin(id: string): Promise<PluginBundle> {
    const p = await plugins.get(id);
    if (!p) throw Object.assign(new Error('Plugin not found'), { status: 404 });
    return p;
  },
  async savePlugin(bundle: PluginBundle) {
    await plugins.save(bundle);
    await logActivity(`Saved plugin ${bundle.manifest.name} ${bundle.manifest.version}`, 'Plugin');
  },

  publicFiles: (sid: string, slug: string) => publisher.publicFiles(sid, slug),

  /**
   * Publishes a board. `share` needs a Drive board and makes a public link; `folder` downloads
   * a static site (`<slug>.zip`) to put on any host, such as a GitHub Pages repo.
   */
  async publish(sid: string, slug: string, req: PublishRequest): Promise<PublishResult & { board: Board }> {
    let url: string;
    let files = 0;
    let bytes = 0;
    if (req.via === 'share') {
      if (sid !== 'gdrive') throw Object.assign(new Error('Share links need a board on Google Drive. Move it there first.'), { status: 400 });
      const id = await publisher.share(drive, slug);
      const key = cloudConfig()?.apiKey;
      const builtInKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
      url = `${location.origin}${location.pathname}#/s/${id}${key && key !== builtInKey ? `?k=${encodeURIComponent(key)}` : ''}`;
    } else {
      const site = await publisher.staticSite(sid, slug);
      const zip: Zippable = {};
      for (const [p, data] of site) {
        zip[join(slug, p)] = data;
        bytes += data.byteLength;
      }
      files = site.size;
      download(`${slug}-site.zip`, zipSync(zip), 'application/zip');
      url = `${slug}/`;
    }
    const full = await boards.get(sid, slug);
    const board = await boards.save(sid, slug, { ...full, visibility: req.visibility, publish: { target: req.via, url, at: Date.now(), cards: full.cards.filter((c) => !c.private).length }, log: [...full.log, { id: uid('e_'), at: Date.now(), action: 'published', text: req.via === 'share' ? 'Published a share link' : 'Exported a static site' }] }, full.rev);
    await logActivity(req.via === 'share' ? 'Published a share link' : 'Exported a static site', full.title);
    return { url, files, bytes, board };
  },

  async unpublish(sid: string, slug: string) {
    const full = await boards.get(sid, slug);
    if (full.publish?.target === 'share' && sid === 'gdrive') await drive.remove(join(slug, 'published'));
    return { board: await boards.save(sid, slug, { ...full, visibility: 'draft', publish: undefined }, full.rev) };
  },

  /** Link previews need a server to fetch other sites; the browser shows the site name only. */
  async unfurl(url: string): Promise<{ url: string; site: string; title?: string; description?: string; image?: string }> {
    return { url, site: hostOf(url) };
  },
};

/**
 * Loads a public share link: one Drive file readable by anyone, fetched with a Google API key.
 *
 * @param key - The API key from the link, else this deployment's built-in key.
 */
export async function loadShared(id: string, key?: string): Promise<SharedBoard & { mediaUrl: (p: string) => string }> {
  const apiKey = key ?? (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined);
  if (!apiKey) throw new Error('This link needs a Google API key. Ask the author for a new link.');
  const file = (fid: string) => `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}?alt=media&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(file(id));
  if (!res.ok) throw new Error(res.status === 404 ? 'This board is no longer published.' : `Could not load the board (${res.status}).`);
  const data = JSON.parse(dec.decode(new Uint8Array(await res.arrayBuffer()))) as SharedBoard;
  for (const [pid, p] of Object.entries(data.plugins)) data.plugins[pid] = p ?? builtInPlugin(pid)!;
  return { ...data, mediaUrl: (p: string) => (p.startsWith('gdrive:') ? file(p.slice(7)) : p) };
}

