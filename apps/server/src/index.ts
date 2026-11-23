import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { Auth, type AppEnv } from './auth';
import { Boards } from './boards';
import { loadConfig } from './config';
import type { Ctx } from './context';
import { initKey } from './crypto';
import { Plugins } from './plugins';
import { Publisher } from './publish';
import { authRoutes } from './routes/auth';
import { boardRoutes } from './routes/boards';
import { miscRoutes } from './routes/misc';
import { publishRoutes, shareRoutes } from './routes/publish';
import { storageRoutes } from './routes/storage';
import { StorageRegistry } from './storage/registry';
import { Store } from './store';

/** Wires services and routes. Exported for tests, which call `app.request()` directly. */
export async function createApp(cfg = loadConfig()) {
  initKey(cfg.dataDir);
  const store = new Store(cfg.dataDir);
  const storages = new StorageRegistry(store, cfg);
  await storages.ensureDefault();
  const boards = new Boards(storages);
  const plugins = new Plugins(cfg.pluginsDir, storages, boards);
  const ctx: Ctx = { cfg, store, auth: new Auth(store, cfg), storages, boards, plugins, publisher: new Publisher(cfg, store, storages, boards, plugins) };

  const app = new Hono<AppEnv>();
  if (process.env.NODE_ENV !== 'test') app.use('/api/*', logger());

  app.route('/api', authRoutes(ctx));
  const api = new Hono<AppEnv>();
  api.use('*', ctx.auth.required());
  api.route('/storages', storageRoutes(ctx));
  api.route('/boards', boardRoutes(ctx));
  api.route('/', miscRoutes(ctx));
  api.route('/', publishRoutes(ctx));
  app.route('/api', api);
  app.route('/', shareRoutes(ctx));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    const e = err as Error & { status?: number; reconnect?: boolean };
    if (e.reconnect) return c.json({ error: e.message, reconnect: true }, 401);
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    if (status === 500) console.error(err);
    return c.json({ error: e.message }, status as 400);
  });

  // Production: serve the built web client with an SPA fallback.
  if (fs.existsSync(cfg.webDist)) {
    app.use('/*', serveStatic({ root: cfg.webDist }));
    const index = fs.readFileSync(`${cfg.webDist}/index.html`, 'utf8');
    app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.notFound() : c.html(index)));
  }
  return { app, ctx };
}

if (process.env.NODE_ENV !== 'test') {
  const { app, ctx } = await createApp();
  serve({ fetch: app.fetch, port: ctx.cfg.port }, () => {
    console.log(`Specimen ${ctx.cfg.version} on ${ctx.cfg.publicUrl} · auth=${ctx.cfg.auth} · data=${ctx.cfg.dataDir}`);
  });
}
