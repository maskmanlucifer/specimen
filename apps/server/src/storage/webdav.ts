import { httpError, join, mimeOf, safePath, type Entry, type StorageAdapter, toBody } from './types';

export interface WebDavConfig {
  /** Base URL of the DAV root, e.g. `https://cloud.example.com/remote.php/dav/files/ana`. */
  endpoint: string;
  username: string;
  password: string;
  prefix: string;
}

/** WebDAV, which also covers Nextcloud and ownCloud. */
export class WebDavStorage implements StorageAdapter {
  private readonly auth: string;

  constructor(private readonly cfg: WebDavConfig) {
    this.auth = `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`;
  }

  private url(p: string) {
    const rel = join(this.cfg.prefix, safePath(p)).split('/').map(encodeURIComponent).join('/');
    return `${this.cfg.endpoint.replace(/\/$/, '')}/${rel}`;
  }

  private req(p: string, init: RequestInit = {}) {
    return fetch(this.url(p), { ...init, headers: { authorization: this.auth, ...init.headers } });
  }

  async list(dir: string): Promise<Entry[]> {
    const res = await this.req(dir, { method: 'PROPFIND', headers: { depth: '1' } });
    if (res.status === 404) return [];
    if (!res.ok) throw await httpError(res, 'PROPFIND');
    const xml = await res.text();
    // Servers return hrefs as paths or as absolute URLs, encoded or not: compare decoded pathnames.
    const pathOf = (u: string) => decodeURIComponent(new URL(u, this.cfg.endpoint).pathname).replace(/\/$/, '');
    const self = pathOf(this.url(dir));
    return [...xml.matchAll(/<(?:\w+:)?response>([\s\S]*?)<\/(?:\w+:)?response>/g)]
      .map(([, r]) => {
        const href = pathOf(r.match(/<(?:\w+:)?href>(.*?)<\/(?:\w+:)?href>/)?.[1] ?? '');
        return {
          name: href.split('/').pop() ?? '',
          href,
          isDir: /<(?:\w+:)?collection\s*\/>/.test(r),
          size: Number(r.match(/getcontentlength>(\d+)</)?.[1] ?? 0),
          modified: Date.parse(r.match(/getlastmodified>(.*?)</)?.[1] ?? '') || undefined,
        };
      })
      .filter((e) => e.href !== self && e.name && !e.name.startsWith('.'))
      .map(({ href: _href, ...e }) => e);
  }

  async read(file: string) {
    const res = await this.req(file);
    if (res.status === 404) return null;
    if (!res.ok) throw await httpError(res, 'GET');
    return new Uint8Array(await res.arrayBuffer());
  }

  private async mkdirs(file: string) {
    const parts = join(this.cfg.prefix, safePath(file)).split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const res = await fetch(`${this.cfg.endpoint.replace(/\/$/, '')}/${parts.slice(0, i).map(encodeURIComponent).join('/')}`, { method: 'MKCOL', headers: { authorization: this.auth } });
      if (!res.ok && res.status !== 405) throw await httpError(res, 'MKCOL'); // 405 = already exists
    }
  }

  async write(file: string, data: Uint8Array, contentType = mimeOf(file)) {
    let res = await this.req(file, { method: 'PUT', body: toBody(data), headers: { 'content-type': contentType } });
    if (res.status === 409 || res.status === 404) {
      await this.mkdirs(file);
      res = await this.req(file, { method: 'PUT', body: toBody(data), headers: { 'content-type': contentType } });
    }
    if (!res.ok) throw await httpError(res, 'PUT');
  }

  async remove(target: string) {
    const res = await this.req(target, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw await httpError(res, 'DELETE');
  }
}
