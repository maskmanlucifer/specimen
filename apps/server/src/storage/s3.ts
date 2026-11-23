import { AwsClient } from 'aws4fetch';
import { httpError, join, mimeOf, safePath, type Entry, type StorageAdapter, toBody } from './types';

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Folder prefix inside the bucket, e.g. `Specimen`. */
  prefix: string;
}

const xmlAll = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
const xmlOne = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];
const unxml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/**
 * Any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, Backblaze B2…), signed with SigV4 via
 * `aws4fetch`. Uses path-style URLs (`endpoint/bucket/key`), which all of them accept.
 */
export class S3Storage implements StorageAdapter {
  private readonly aws: AwsClient;

  constructor(private readonly cfg: S3Config) {
    this.aws = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region || 'auto', service: 's3' });
  }

  private key(p: string) {
    return join(this.cfg.prefix, safePath(p));
  }

  private url(key: string, query = '') {
    const k = key.split('/').map(encodeURIComponent).join('/');
    return `${this.cfg.endpoint.replace(/\/$/, '')}/${this.cfg.bucket}/${k}${query}`;
  }

  async list(dir: string): Promise<Entry[]> {
    const prefix = this.key(dir) ? `${this.key(dir)}/` : '';
    const out: Entry[] = [];
    let token: string | undefined;
    do {
      const q = new URLSearchParams({ 'list-type': '2', delimiter: '/', prefix, ...(token ? { 'continuation-token': token } : {}) });
      const res = await this.aws.fetch(`${this.cfg.endpoint.replace(/\/$/, '')}/${this.cfg.bucket}?${q}`);
      if (!res.ok) throw await httpError(res, 'ListObjectsV2');
      const xml = await res.text();
      for (const c of xmlAll(xml, 'Contents')) {
        const name = unxml(xmlOne(c, 'Key')!).slice(prefix.length);
        if (name && !name.startsWith('.')) out.push({ name, isDir: false, size: Number(xmlOne(c, 'Size') ?? 0), modified: Date.parse(xmlOne(c, 'LastModified') ?? '') || undefined });
      }
      for (const p of xmlAll(xml, 'CommonPrefixes')) out.push({ name: unxml(xmlOne(p, 'Prefix')!).slice(prefix.length).replace(/\/$/, ''), isDir: true, size: 0 });
      token = xmlOne(xml, 'IsTruncated') === 'true' ? unxml(xmlOne(xml, 'NextContinuationToken') ?? '') : undefined;
    } while (token);
    return out;
  }

  async read(file: string) {
    const res = await this.aws.fetch(this.url(this.key(file)));
    if (res.status === 404) return null;
    if (!res.ok) throw await httpError(res, 'GetObject');
    return new Uint8Array(await res.arrayBuffer());
  }

  async write(file: string, data: Uint8Array, contentType = mimeOf(file)) {
    const res = await this.aws.fetch(this.url(this.key(file)), { method: 'PUT', body: toBody(data), headers: { 'content-type': contentType } });
    if (!res.ok) throw await httpError(res, 'PutObject');
  }

  async remove(target: string) {
    const res = await this.aws.fetch(this.url(this.key(target)), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw await httpError(res, 'DeleteObject');
    // A "folder" is only a prefix: delete every object below it.
    for (const e of await this.list(target)) await this.remove(join(target, e.name));
  }

  async usage() {
    let used = 0;
    const walk = async (dir: string): Promise<void> => {
      for (const e of await this.list(dir)) e.isDir ? await walk(join(dir, e.name)) : (used += e.size);
    };
    await walk('');
    return { used };
  }

  /** A presigned GET URL valid for 7 days (the SigV4 maximum). */
  async share(file: string) {
    const signed = await this.aws.sign(this.url(this.key(file), '?X-Amz-Expires=604800'), { aws: { signQuery: true } });
    return signed.url;
  }
}
