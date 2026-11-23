import { authed, authedOk, type TokenSource } from './oauth-base';
import { httpError, join, safePath, type Entry, type StorageAdapter, toBody } from './types';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';
/** Dropbox single-request uploads are limited to 150 MB; bigger files use an upload session. */
const CHUNK = 64 * 1024 * 1024;

/** Dropbox. Paths are native, so no id resolution is needed. */
export class DropboxStorage implements StorageAdapter {
  constructor(
    private readonly token: TokenSource,
    private readonly prefix: string,
  ) {}

  private path(p: string) {
    const rel = join(this.prefix, safePath(p));
    return rel ? `/${rel}` : '';
  }

  private rpc(endpoint: string, body: unknown, allow: number[] = []) {
    return authedOk(this.token, `${API}/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, `Dropbox ${endpoint}`, allow);
  }

  async list(dir: string): Promise<Entry[]> {
    const out: Entry[] = [];
    let res = await this.rpc('files/list_folder', { path: this.path(dir) }, [409]);
    if (res.status === 409) return []; // path/not_found
    let json = (await res.json()) as { entries: { '.tag': string; name: string; size?: number; server_modified?: string }[]; cursor: string; has_more: boolean };
    for (;;) {
      for (const e of json.entries) if (!e.name.startsWith('.')) out.push({ name: e.name, isDir: e['.tag'] === 'folder', size: e.size ?? 0, modified: Date.parse(e.server_modified ?? '') || undefined });
      if (!json.has_more) return out;
      res = await this.rpc('files/list_folder/continue', { cursor: json.cursor });
      json = await res.json();
    }
  }

  async read(file: string) {
    const res = await authed(this.token, `${CONTENT}/files/download`, { method: 'POST', headers: { 'dropbox-api-arg': JSON.stringify({ path: this.path(file) }) } }, 'Dropbox download');
    if (res.status === 409) return null;
    if (!res.ok) throw await httpError(res, 'Dropbox download');
    return new Uint8Array(await res.arrayBuffer());
  }

  async write(file: string, data: Uint8Array) {
    const commit = { path: this.path(file), mode: 'overwrite', mute: true };
    const post = (endpoint: string, arg: unknown, body: Uint8Array) =>
      authedOk(this.token, `${CONTENT}/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'dropbox-api-arg': JSON.stringify(arg) }, body: toBody(body) }, `Dropbox ${endpoint}`);
    if (data.byteLength <= CHUNK) {
      await post('files/upload', commit, data);
      return;
    }
    const start = await post('files/upload_session/start', {}, data.subarray(0, CHUNK));
    const { session_id } = (await start.json()) as { session_id: string };
    let offset = CHUNK;
    while (data.byteLength - offset > CHUNK) {
      await post('files/upload_session/append_v2', { cursor: { session_id, offset } }, data.subarray(offset, offset + CHUNK));
      offset += CHUNK;
    }
    await post('files/upload_session/finish', { cursor: { session_id, offset }, commit }, data.subarray(offset));
  }

  async remove(target: string) {
    await this.rpc('files/delete_v2', { path: this.path(target) }, [409]);
  }

  async usage() {
    const res = await this.rpc('users/get_space_usage', null);
    const json = (await res.json()) as { used: number; allocation: { allocated?: number } };
    return { used: json.used, total: json.allocation.allocated };
  }

  async share(file: string) {
    const res = await this.rpc('sharing/create_shared_link_with_settings', { path: this.path(file) }, [409]);
    const json = (await res.json()) as { url?: string; error?: { shared_link_already_exists?: { metadata: { url: string } } } };
    const url = json.url ?? json.error?.shared_link_already_exists?.metadata.url;
    if (!url) throw new Error('Dropbox share failed');
    return url.replace('dl=0', 'raw=1');
  }
}
