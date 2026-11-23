import { Hono } from 'hono';
import type { StorageCredentials, StorageKind } from '@specimen/schema';
import type { AppEnv } from '../auth';
import type { Ctx } from '../context';
import { testStorage } from '../storage/registry';
import { LocalStorage } from '../storage/local';
import { S3Storage } from '../storage/s3';
import { WebDavStorage } from '../storage/webdav';
import type { StorageAdapter } from '../storage/types';
import { beginOAuth } from './auth';

const KEY_KINDS: StorageKind[] = ['local', 's3', 'r2', 'webdav', 'nextcloud'];

/** Adapter from a key form, before it is saved (for "Test connection"). */
function draftAdapter(kind: StorageKind, root: string, c: StorageCredentials): StorageAdapter {
  const prefix = root.replace(/^\/+/, '');
  if (kind === 'local') return new LocalStorage(c.path!);
  if (kind === 's3' || kind === 'r2') return new S3Storage({ endpoint: c.endpoint!, bucket: c.bucket!, region: c.region || 'auto', accessKeyId: c.accessKeyId!, secretAccessKey: c.secretAccessKey!, prefix });
  return new WebDavStorage({ endpoint: c.endpoint!, username: c.username!, password: c.password!, prefix });
}

export function storageRoutes(ctx: Ctx) {
  const app = new Hono<AppEnv>();

  app.get('/', async (c) => {
    const withUsage = c.req.query('usage') === '1';
    return c.json(await Promise.all((await ctx.storages.all()).map((s) => ctx.storages.info(s, withUsage))));
  });

  app.post('/test', async (c) => {
    const { kind, root = '/Specimen', credentials } = await c.req.json<{ kind: StorageKind; root?: string; credentials: StorageCredentials }>();
    if (!KEY_KINDS.includes(kind)) return c.json({ error: 'Test is for key-based storage' }, 400);
    return c.json(await testStorage(draftAdapter(kind, root, credentials), kind, credentials.bucket));
  });

  /** Saves a key-based connection (S3, R2, WebDAV, local). OAuth kinds go through `/connect`. */
  app.post('/', async (c) => {
    const { id, kind, name, root = '/Specimen', credentials } = await c.req.json<{ id?: string; kind: StorageKind; name?: string; root?: string; credentials: StorageCredentials }>();
    if (!KEY_KINDS.includes(kind)) return c.json({ error: 'Use /connect for this provider' }, 400);
    const { endpoint = '', bucket = '', region = '', path = '', accessKeyId, secretAccessKey, username, password } = credentials;
    const hasSecret = accessKeyId || secretAccessKey || username || password;
    const st = await ctx.storages.save({ id, kind, name, root, config: { endpoint, bucket, region, path }, secret: hasSecret ? { accessKeyId, secretAccessKey, username, password } : undefined });
    await ctx.store.logActivity(`Connected ${st.name}`, 'Storage');
    return c.json(await ctx.storages.info(st));
  });

  app.get('/connect/:kind', (c) => {
    const kind = c.req.param('kind');
    if (kind !== 'gdrive' && kind !== 'dropbox' && kind !== 'onedrive') return c.json({ error: 'Unknown provider' }, 404);
    return c.redirect(beginOAuth(ctx, kind, 'storage', { storageId: c.req.query('id'), root: c.req.query('root') }));
  });

  app.patch('/:id', async (c) => {
    const body = await c.req.json<{ name?: string; root?: string; isDefault?: boolean }>();
    const st = await ctx.storages.get(c.req.param('id'));
    if (body.isDefault) await ctx.storages.setDefault(st.id);
    const next = await ctx.storages.save({ id: st.id, kind: st.kind, name: body.name, root: body.root, config: {} });
    return c.json(await ctx.storages.info(next));
  });

  app.delete('/:id', async (c) => {
    await ctx.storages.remove(c.req.param('id'));
    return c.json({ ok: true });
  });

  /** "Disconnect all storage": removes Specimen's tokens; files in storage are untouched. */
  app.delete('/', async (c) => {
    for (const s of await ctx.storages.all()) if (s.kind !== 'local') await ctx.storages.remove(s.id);
    return c.json({ ok: true });
  });

  return app;
}
