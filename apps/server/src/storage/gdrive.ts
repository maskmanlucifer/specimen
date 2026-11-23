import { authedOk, type TokenSource } from './oauth-base';
import { join, mimeOf, safePath, type Entry, type StorageAdapter, toBody } from './types';

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

/**
 * Google Drive with the `drive.file` scope: Specimen sees only files it created.
 * Drive has ids, not paths, so paths are resolved folder by folder and cached per instance.
 */
export class GoogleDriveStorage implements StorageAdapter {
  private readonly ids = new Map<string, string>();

  constructor(
    private readonly token: TokenSource,
    /** Root folder name in My Drive, e.g. `Specimen`. */
    private readonly rootName: string,
  ) {}

  private async child(parent: string, name: string): Promise<DriveFile | null> {
    const q = `name = '${name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed = false`;
    const res = await authedOk(this.token, `${API}/files?${new URLSearchParams({ q, fields: 'files(id,name,mimeType,size,modifiedTime)', pageSize: '1' })}`, {}, 'Drive files.list');
    return ((await res.json()) as { files: DriveFile[] }).files[0] ?? null;
  }

  private async mkdir(parent: string, name: string): Promise<string> {
    const res = await authedOk(this.token, `${API}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) }, 'Drive mkdir');
    return ((await res.json()) as { id: string }).id;
  }

  /** Resolves a path to a file id. With `create`, makes missing folders on the way. */
  private async resolve(p: string, create = false): Promise<string | null> {
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
      const json = (await (await authedOk(this.token, `${API}/files?${q}`, {}, 'Drive files.list')).json()) as { files: DriveFile[]; nextPageToken?: string };
      for (const f of json.files) {
        this.ids.set(join(this.rootName, dir, f.name), f.id);
        out.push({ name: f.name, isDir: f.mimeType === FOLDER, size: Number(f.size ?? 0), modified: Date.parse(f.modifiedTime ?? '') || undefined });
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }

  async read(file: string) {
    const id = await this.resolve(file);
    if (!id) return null;
    const res = await authedOk(this.token, `${API}/files/${id}?alt=media`, {}, 'Drive download', [404]);
    if (res.status === 404) {
      this.ids.delete(join(this.rootName, file));
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async write(file: string, data: Uint8Array, contentType = mimeOf(file)) {
    const clean = safePath(file);
    const name = clean.split('/').pop()!;
    const parent = await this.resolve(clean.split('/').slice(0, -1).join('/'), true);
    const existing = await this.resolve(clean);
    // Resumable upload works for every size, so there is one code path.
    const meta = existing ? {} : { name, parents: [parent] };
    const start = await authedOk(
      this.token,
      existing ? `${UPLOAD}/files/${existing}?uploadType=resumable` : `${UPLOAD}/files?uploadType=resumable&fields=id`,
      { method: existing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json', 'x-upload-content-type': contentType }, body: JSON.stringify(meta) },
      'Drive upload start',
    );
    const location = start.headers.get('location');
    if (!location) throw new Error('Drive upload: no session URL');
    const res = await authedOk(this.token, location, { method: 'PUT', body: toBody(data), headers: { 'content-type': contentType } }, 'Drive upload');
    const { id } = (await res.json()) as { id: string };
    this.ids.set(join(this.rootName, clean), id);
  }

  async remove(target: string) {
    const id = await this.resolve(target);
    if (!id) return;
    await authedOk(this.token, `${API}/files/${id}`, { method: 'DELETE' }, 'Drive delete', [404]);
    for (const k of this.ids.keys()) if (k === join(this.rootName, target) || k.startsWith(`${join(this.rootName, target)}/`)) this.ids.delete(k);
  }

  async usage() {
    const res = await authedOk(this.token, `${API}/about?fields=storageQuota`, {}, 'Drive about');
    const { storageQuota } = (await res.json()) as { storageQuota: { usage: string; limit?: string } };
    return { used: Number(storageQuota.usage), total: storageQuota.limit ? Number(storageQuota.limit) : undefined };
  }

  /** Makes the file readable by anyone with the link and returns a direct download URL. */
  async share(file: string) {
    const id = await this.resolve(file);
    if (!id) throw new Error(`Not found: ${file}`);
    await authedOk(this.token, `${API}/files/${id}/permissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) }, 'Drive share');
    return `https://drive.google.com/uc?export=download&id=${id}`;
  }
}
