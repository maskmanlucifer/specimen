import path from 'node:path';
import { STORAGE_NAME, uid, type StorageCredentials, type StorageInfo, type StorageKind, type StorageTestResult } from '@specimen/schema';
import type { Config } from '../config';
import { open, seal } from '../crypto';
import { ReconnectError, refresh, type OAuthProvider, type OAuthTokens } from '../oauth';
import type { Store, StoredStorage } from '../store';
import { DropboxStorage } from './dropbox';
import { GoogleDriveStorage } from './gdrive';
import { LocalStorage } from './local';
import { OneDriveStorage } from './onedrive';
import { S3Storage } from './s3';
import { enc, type StorageAdapter } from './types';
import { WebDavStorage } from './webdav';

const OAUTH_KIND: Partial<Record<StorageKind, OAuthProvider>> = { gdrive: 'gdrive', dropbox: 'dropbox', onedrive: 'onedrive' };

/** Builds adapters for stored connections and keeps their OAuth tokens fresh. */
export class StorageRegistry {
  private readonly cache = new Map<string, StorageAdapter>();

  constructor(
    private readonly store: Store,
    private readonly cfg: Config,
  ) {}

  /** Creates the default local storage on first boot so a new instance works with zero setup. */
  async ensureDefault() {
    const s = await this.store.read();
    if (s.storages.length) return;
    await this.store.update((st) => {
      st.storages.push({ id: 'local', kind: 'local', name: 'Local folder', root: '/Specimen', isDefault: true, config: { path: path.join(this.cfg.dataDir, 'Specimen') } });
    });
  }

  async all(): Promise<StoredStorage[]> {
    return (await this.store.read()).storages;
  }

  async get(id: string): Promise<StoredStorage> {
    const found = (await this.all()).find((s) => s.id === id);
    if (!found) throw Object.assign(new Error(`Unknown storage ${id}`), { status: 404 });
    return found;
  }

  /** Adapter for a stored connection (cached per id; call {@link forget} after changing it). */
  async adapter(id: string): Promise<StorageAdapter> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const st = await this.get(id);
    const a = this.build(st);
    this.cache.set(id, a);
    return a;
  }

  forget(id: string) {
    this.cache.delete(id);
  }

  private build(st: StoredStorage): StorageAdapter {
    const creds = st.secret ? open<StorageCredentials & OAuthTokens>(st.secret) : ({} as StorageCredentials & OAuthTokens);
    const prefix = st.root.replace(/^\/+/, '');
    switch (st.kind) {
      case 'local':
        return new LocalStorage(st.config.path);
      case 's3':
      case 'r2':
        return new S3Storage({ endpoint: st.config.endpoint, bucket: st.config.bucket, region: st.config.region || 'auto', accessKeyId: creds.accessKeyId!, secretAccessKey: creds.secretAccessKey!, prefix });
      case 'webdav':
      case 'nextcloud':
        return new WebDavStorage({ endpoint: st.config.endpoint, username: creds.username!, password: creds.password!, prefix });
      case 'gdrive':
        return new GoogleDriveStorage(this.tokenSource(st.id), prefix);
      case 'dropbox':
        return new DropboxStorage(this.tokenSource(st.id), prefix);
      case 'onedrive':
        return new OneDriveStorage(this.tokenSource(st.id), prefix);
    }
  }

  /** Access token getter that refreshes ~1 minute before expiry and persists the new tokens. */
  private tokenSource(id: string) {
    return async () => {
      const st = await this.get(id);
      if (!st.secret) throw new ReconnectError('Not connected');
      const tokens = open<OAuthTokens>(st.secret);
      if (!tokens.expires_at || tokens.expires_at > Date.now() + 60_000) return tokens.access_token;
      const provider = OAUTH_KIND[st.kind]!;
      const client = this.cfg.oauth[provider === 'gdrive' ? 'google' : (provider as 'dropbox' | 'onedrive')];
      if (!client) throw new ReconnectError(`${provider} is not configured on this instance`);
      try {
        const next = await refresh(provider, client, tokens);
        await this.store.update((s) => {
          const t = s.storages.find((x) => x.id === id)!;
          t.secret = seal(next);
          t.needsReconnect = false;
        });
        return next.access_token;
      } catch (e) {
        await this.store.update((s) => {
          s.storages.find((x) => x.id === id)!.needsReconnect = true;
        });
        throw e;
      }
    };
  }

  /** Adds or replaces a connection. The first connection becomes the default. */
  async save(input: { id?: string; kind: StorageKind; name?: string; root?: string; account?: string; config: Record<string, string>; secret?: unknown }): Promise<StoredStorage> {
    const out = await this.store.update((s) => {
      const id = input.id ?? uid('st_');
      const prev = s.storages.find((x) => x.id === id);
      const next: StoredStorage = {
        id,
        kind: input.kind,
        name: input.name ?? prev?.name ?? STORAGE_NAME[input.kind],
        root: input.root ?? prev?.root ?? '/Specimen',
        isDefault: prev?.isDefault ?? !s.storages.some((x) => x.isDefault),
        account: input.account ?? prev?.account,
        config: { ...prev?.config, ...input.config },
        secret: input.secret ? seal(input.secret) : prev?.secret,
        needsReconnect: false,
      };
      s.storages = prev ? s.storages.map((x) => (x.id === id ? next : x)) : [...s.storages, next];
      return next;
    });
    this.forget(out.id);
    return out;
  }

  async remove(id: string) {
    await this.store.update((s) => {
      const wasDefault = s.storages.find((x) => x.id === id)?.isDefault;
      s.storages = s.storages.filter((x) => x.id !== id);
      if (wasDefault && s.storages[0]) s.storages[0].isDefault = true;
    });
    this.forget(id);
  }

  async setDefault(id: string) {
    await this.store.update((s) => s.storages.forEach((x) => (x.isDefault = x.id === id)));
  }

  /** Public view of a connection: never includes secrets. */
  async info(st: StoredStorage, withUsage = false): Promise<StorageInfo> {
    let usage: StorageInfo['usage'];
    let status: StorageInfo['status'] = st.needsReconnect ? 'reconnect' : 'ok';
    if (withUsage && status === 'ok') {
      try {
        usage = await (await this.adapter(st.id)).usage?.();
      } catch (e) {
        status = (e as ReconnectError).reconnect ? 'reconnect' : 'disconnected';
      }
    }
    let keyHint: string | undefined;
    if (st.secret && (st.kind === 's3' || st.kind === 'r2')) keyHint = open<StorageCredentials>(st.secret).secretAccessKey?.slice(-4);
    return { id: st.id, kind: st.kind, name: st.name, root: st.root, isDefault: st.isDefault, status, usage, keyHint, account: st.account };
  }
}

/**
 * Writes, reads, lists and deletes one tiny file, like the "Test connection" button promises.
 * Errors are turned into plain-language advice where the cause is known.
 */
export async function testStorage(adapter: StorageAdapter, kind: StorageKind, bucket = ''): Promise<StorageTestResult> {
  const t0 = performance.now();
  const checks = { read: false, write: false, list: false };
  const file = '.specimen-check';
  try {
    await adapter.write(file, enc.encode(String(Date.now())), 'text/plain');
    checks.write = true;
    checks.read = !!(await adapter.read(file));
    await adapter.list('');
    checks.list = true;
    await adapter.remove(file);
    return { ok: true, ms: Math.round(performance.now() - t0), checks };
  } catch (e) {
    const err = e as Error & { status?: number };
    const name = STORAGE_NAME[kind];
    let error = { title: 'Connection failed', detail: err.message };
    if (err.status === 403 && !checks.write)
      error = {
        title: 'This key can read but not write',
        detail: `${name} returned 403 AccessDenied on PutObject. ${kind === 'r2' ? `In Cloudflare, give the token “Object Read & Write” for the bucket ${bucket}` : `Give the key s3:PutObject and s3:DeleteObject on the bucket ${bucket}`}, then test again.`,
      };
    else if (err.status === 403 || err.status === 401) error = { title: 'The key was refused', detail: `${name} returned ${err.status}. Check the access key ID and secret.` };
    else if (err.status === 404) error = { title: 'Bucket or folder not found', detail: `Check the endpoint and the name “${bucket}”.` };
    else if (/fetch failed|ENOTFOUND|ECONNREFUSED/.test(err.message)) error = { title: 'Cannot reach the endpoint', detail: 'Check the endpoint URL and that this server can reach it.' };
    return { ok: false, ms: Math.round(performance.now() - t0), checks, error };
  }
}
