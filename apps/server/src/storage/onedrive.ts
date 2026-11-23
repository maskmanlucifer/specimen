import { authed, authedOk, type TokenSource } from './oauth-base';
import { httpError, join, safePath, type Entry, type StorageAdapter, toBody } from './types';

/** The app folder (`Apps/Specimen`): the narrowest OneDrive scope, like drive.file on Google. */
const ROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
/** Graph simple upload limit. Larger files need an upload session. */
const SIMPLE_MAX = 4 * 1024 * 1024;
/** Upload session chunks must be a multiple of 320 KiB. */
const CHUNK = 320 * 1024 * 32;

/** Microsoft OneDrive via Microsoft Graph, using path-addressed items. */
export class OneDriveStorage implements StorageAdapter {
  constructor(
    private readonly token: TokenSource,
    private readonly prefix: string,
  ) {}

  private item(p: string) {
    const rel = join(this.prefix, safePath(p));
    return rel ? `${ROOT}:/${rel.split('/').map(encodeURIComponent).join('/')}:` : ROOT;
  }

  async list(dir: string): Promise<Entry[]> {
    const out: Entry[] = [];
    let url: string | undefined = `${this.item(dir)}/children?$top=999`;
    while (url) {
      const res = await authedOk(this.token, url, {}, 'OneDrive list', [404]);
      if (res.status === 404) return [];
      const json = (await res.json()) as { value: { name: string; size: number; folder?: object; lastModifiedDateTime: string }[]; '@odata.nextLink'?: string };
      for (const v of json.value) if (!v.name.startsWith('.')) out.push({ name: v.name, isDir: !!v.folder, size: v.size, modified: Date.parse(v.lastModifiedDateTime) });
      url = json['@odata.nextLink'];
    }
    return out;
  }

  async read(file: string) {
    const res = await authed(this.token, `${this.item(file)}/content`, {}, 'OneDrive download');
    if (res.status === 404) return null;
    if (!res.ok) throw await httpError(res, 'OneDrive download');
    return new Uint8Array(await res.arrayBuffer());
  }

  async write(file: string, data: Uint8Array) {
    if (data.byteLength <= SIMPLE_MAX) {
      await authedOk(this.token, `${this.item(file)}/content`, { method: 'PUT', body: toBody(data) }, 'OneDrive upload');
      return;
    }
    const session = await authedOk(this.token, `${this.item(file)}/createUploadSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) }, 'OneDrive session');
    const { uploadUrl } = (await session.json()) as { uploadUrl: string };
    for (let off = 0; off < data.byteLength; off += CHUNK) {
      const part = data.subarray(off, off + CHUNK);
      // The upload URL is pre-authorised; sending a bearer token to it is rejected.
      const res = await fetch(uploadUrl, { method: 'PUT', body: toBody(part), headers: { 'content-range': `bytes ${off}-${off + part.byteLength - 1}/${data.byteLength}` } });
      if (!res.ok) throw await httpError(res, 'OneDrive upload chunk');
    }
  }

  async remove(target: string) {
    await authedOk(this.token, this.item(target), { method: 'DELETE' }, 'OneDrive delete', [404]);
  }

  async usage() {
    const res = await authedOk(this.token, 'https://graph.microsoft.com/v1.0/me/drive?$select=quota', {}, 'OneDrive quota');
    const { quota } = (await res.json()) as { quota: { used: number; total: number } };
    return { used: quota.used, total: quota.total };
  }

  async share(file: string) {
    const res = await authedOk(this.token, `${this.item(file)}/createLink`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'view', scope: 'anonymous' }) }, 'OneDrive share');
    const json = (await res.json()) as { link: { webUrl: string } };
    return json.link.webUrl;
  }
}
