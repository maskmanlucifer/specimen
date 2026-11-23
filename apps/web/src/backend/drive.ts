import { join, mimeOf, ReconnectError, safePath, type Entry, type StorageAdapter } from './files';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

/** Returns a Drive access token. `force` skips the cache after a 401. */
export type TokenSource = (force?: boolean) => Promise<string>;

/**
 * Google Drive with the `drive.file` scope: Specimen sees only files it created.
 * Drive has ids, not paths, so paths resolve folder by folder and are cached.
 */
export class DriveStorage implements StorageAdapter {
  private readonly ids = new Map<string, string>();

  constructor(
    private readonly token: TokenSource,
    /** Root folder name in My Drive. */
    private readonly rootName = 'Specimen',
  ) {}

  /**
   * `fetch` with the bearer token. A 401 retries once with a fresh token, then asks for a new sign-in.
   *
   * @throws {@link ReconnectError} when access is gone; an Error with `status` for other failures.
   */
  private async call(url: string, init: RequestInit = {}, what = 'Drive', allow: number[] = []): Promise<Response> {
    const go = async (force: boolean) => fetch(url, { ...init, headers: { authorization: `Bearer ${await this.token(force)}`, ...init.headers } });
    let res = await go(false);
    if (res.status === 401) res = await go(true);
    if (res.status === 401) throw new ReconnectError(`${what}: Google access expired`);
    if (!res.ok && !allow.includes(res.status)) {
      const body = await res.text().catch(() => '');
      throw Object.assign(new Error(`${what}: ${res.status} ${body.slice(0, 200)}`), { status: res.status });
    }
    return res;
  }

  private async child(parent: string, name: string): Promise<DriveFile | null> {
    const q = `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parent}' in parents and trashed = false`;
    const res = await this.call(`${API}/files?${new URLSearchParams({ q, fields: 'files(id,name,mimeType,size,modifiedTime)', pageSize: '1' })}`, {}, 'Drive files.list');
    return ((await res.json()) as { files: DriveFile[] }).files[0] ?? null;
  }

  private async mkdir(parent: string, name: string): Promise<string> {
    const res = await this.call(`${API}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) }, 'Drive mkdir');
    return ((await res.json()) as { id: string }).id;
  }

  /** Resolves a path to a file id. With `create`, makes missing folders on the way. */
  async resolve(p: string, create = false): Promise<string | null> {
    const parts = join(this.rootName, safePath(p)).split('/');
    let id = 'root';
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      const cached = this.ids.get(acc);
      if (cached) {
        id = cached;
        continue;
      }
      const found = await this.child(id, part);
      if (!found && !create) return null;
      id = found ? found.id : await this.mkdir(id, part);
      this.ids.set(acc, id);
    }
    return id;
  }

  async list(dir: string): Promise<Entry[]> {
    const id = await this.resolve(dir);
    if (!id) return [];
    const out: Entry[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ q: `'${id}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)', pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
      const json = (await (await this.call(`${API}/files?${q}`, {}, 'Drive files.list')).json()) as { files: DriveFile[]; nextPageToken?: string };
      for (const f of json.files) {
        this.ids.set(join(this.rootName, dir, f.name), f.id);
        out.push({ name: f.name, isDir: f.mimeType === FOLDER, size: Number(f.size ?? 0), modified: Date.parse(f.modifiedTime ?? '') || undefined });
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }

  async blob(file: string): Promise<Blob | null> {
    const id = await this.resolve(file);
    if (!id) return null;
    const res = await this.call(`${API}/files/${id}?alt=media`, {}, 'Drive download', [404]);
    if (res.status === 404) {
      this.ids.delete(join(this.rootName, file));
      return null;
    }
    return new Blob([await res.arrayBuffer()], { type: mimeOf(file) });
  }

  async read(file: string) {
    const b = await this.blob(file);
    return b ? new Uint8Array(await b.arrayBuffer()) : null;
  }

  async write(file: string, data: Uint8Array | Blob, contentType = mimeOf(file)) {
    const clean = safePath(file);
    const name = clean.split('/').pop()!;
    const parent = await this.resolve(clean.split('/').slice(0, -1).join('/'), true);
    const existing = await this.resolve(clean);
    // Resumable upload works for every size, so there is one code path.
    const start = await this.call(
      existing ? `${UPLOAD}/files/${existing}?uploadType=resumable` : `${UPLOAD}/files?uploadType=resumable&fields=id`,
      { method: existing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json', 'x-upload-content-type': contentType }, body: JSON.stringify(existing ? {} : { name, parents: [parent] }) },
      'Drive upload start',
    );
    const location = start.headers.get('location');
    if (!location) throw new Error('Drive upload: no session URL');
    const body = data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>], { type: contentType });
    const res = await this.call(location, { method: 'PUT', body, headers: { 'content-type': contentType } }, 'Drive upload');
    const { id } = (await res.json()) as { id: string };
    this.ids.set(join(this.rootName, clean), id);
  }

  async remove(target: string) {
    const id = await this.resolve(target);
    if (!id) return;
    await this.call(`${API}/files/${id}`, { method: 'DELETE' }, 'Drive delete', [404]);
    const key = join(this.rootName, target);
    for (const k of this.ids.keys()) if (k === key || k.startsWith(`${key}/`)) this.ids.delete(k);
  }

  async usage() {
    const res = await this.call(`${API}/about?fields=storageQuota`, {}, 'Drive about');
    const { storageQuota } = (await res.json()) as { storageQuota: { usage: string; limit?: string } };
    return { used: Number(storageQuota.usage), total: storageQuota.limit ? Number(storageQuota.limit) : undefined };
  }

  /**
   * Makes a file readable by anyone with the link (for share links).
   *
   * @returns The Drive file id.
   */
  async share(file: string): Promise<string> {
    const id = await this.resolve(file);
    if (!id) throw new Error(`Not found: ${file}`);
    await this.call(`${API}/files/${id}/permissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) }, 'Drive share');
    return id;
  }
}
