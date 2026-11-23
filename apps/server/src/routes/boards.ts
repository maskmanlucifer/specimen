import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import type { Board, BoardResponse } from '@specimen/schema';
import type { AppEnv } from '../auth';
import { ConflictError } from '../boards';
import type { Context } from 'hono';
import type { Ctx } from '../context';
import { mimeOf } from '../storage/types';

/** Chunked uploads land here first, then go to the storage in one write. */
const uploadDir = (ctx: Ctx) => path.join(ctx.cfg.dataDir, 'uploads');

/** Serves bytes with HTTP Range support, so audio and video can seek. */
function sendBytes(c: Context, data: Uint8Array, file: string) {
  const type = mimeOf(file);
  const range = c.req.header('range')?.match(/bytes=(\d*)-(\d*)/);
  const headers: Record<string, string> = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=60' };
  if (!range) return c.body(data as Uint8Array<ArrayBuffer>, 200, { ...headers, 'content-length': String(data.byteLength) });
  const start = range[1] ? Number(range[1]) : data.byteLength - Number(range[2]);
  const end = range[1] && range[2] ? Math.min(Number(range[2]), data.byteLength - 1) : data.byteLength - 1;
  return c.body(data.subarray(start, end + 1) as Uint8Array<ArrayBuffer>, 206, { ...headers, 'content-range': `bytes ${start}-${end}/${data.byteLength}`, 'content-length': String(end - start + 1) });
}

export function boardRoutes(ctx: Ctx) {
  const app = new Hono<AppEnv>();

  app.get('/', async (c) => c.json(await ctx.boards.list()));

  app.post('/', async (c) => {
    const { storageId, title, template } = await c.req.json<{ storageId?: string; title: string; template?: string }>();
    const sid = storageId ?? (await ctx.storages.all()).find((s) => s.isDefault)?.id;
    if (!sid) return c.json({ error: 'Connect a storage first' }, 400);
    const board = await ctx.boards.create(sid, title.trim() || 'Untitled board', c.get('user').name, template);
    await ctx.store.logActivity('Created board', board.title);
    return c.json({ storageId: sid, board });
  });

  app.get('/:sid/:slug', async (c) => {
    const board = await ctx.boards.get(c.req.param('sid'), c.req.param('slug'));
    const body: BoardResponse = { board, storage: await ctx.storages.info(await ctx.storages.get(c.req.param('sid'))) };
    return c.json(body);
  });

  app.put('/:sid/:slug', async (c) => {
    const { board, baseRev, force } = await c.req.json<{ board: Board; baseRev: number; force?: boolean }>();
    try {
      return c.json({ board: await ctx.boards.save(c.req.param('sid'), c.req.param('slug'), board, baseRev, force) });
    } catch (e) {
      if (e instanceof ConflictError) return c.json({ error: e.message, current: e.current }, 409);
      throw e;
    }
  });

  app.post('/:sid/:slug/move', async (c) => {
    const { to } = await c.req.json<{ to: string }>();
    const board = await ctx.boards.move(c.req.param('sid'), c.req.param('slug'), to);
    return c.json({ storageId: to, board });
  });

  app.get('/:sid/:slug/files', async (c) => c.json(await ctx.boards.files(c.req.param('sid'), c.req.param('slug'))));

  app.get('/:sid/:slug/media/*', async (c) => {
    const file = decodeURIComponent(c.req.path.split('/media/').slice(1).join('/media/'));
    const data = await ctx.boards.readMedia(c.req.param('sid'), c.req.param('slug'), `media/${file}`);
    if (!data) return c.json({ error: 'Media not found' }, 404);
    return sendBytes(c, data, file);
  });

  /**
   * Chunked upload: the client sends 8 MB parts with `offset`; the last part (offset + size = total)
   * moves the file into storage. Parts can be resent after a pause, so uploads resume.
   */
  app.post('/:sid/:slug/upload', async (c) => {
    const q = c.req.query();
    const id = (q.id ?? '').replace(/[^\w-]/g, '');
    if (!id) return c.json({ error: 'Missing upload id' }, 400);
    const offset = Number(q.offset ?? 0);
    const total = Number(q.total ?? 0);
    const chunk = new Uint8Array(await c.req.arrayBuffer());
    const tmp = path.join(uploadDir(ctx), id);
    await fs.mkdir(uploadDir(ctx), { recursive: true });
    const fh = await fs.open(tmp, offset === 0 ? 'w' : 'r+');
    await fh.write(chunk, 0, chunk.byteLength, offset);
    await fh.close();
    if (offset + chunk.byteLength < total) return c.json({ received: offset + chunk.byteLength });
    const data = new Uint8Array(await fs.readFile(tmp));
    const src = await ctx.boards.putMedia(c.req.param('sid'), c.req.param('slug'), q.name ?? 'file', data, c.req.header('x-content-type'));
    await fs.rm(tmp, { force: true });
    return c.json({ received: total, src, size: data.byteLength });
  });

  /** How far an interrupted upload got, so the client can resume from there. */
  app.get('/:sid/:slug/upload/:id', async (c) => {
    const st = await fs.stat(path.join(uploadDir(ctx), c.req.param('id').replace(/[^\w-]/g, ''))).catch(() => null);
    return c.json({ received: st?.size ?? 0 });
  });

  return app;
}
