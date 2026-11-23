import { Hono } from 'hono';
import { zipSync } from 'fflate';
import { slugify, type HostKind, type PublishRequest } from '@specimen/schema';
import type { AppEnv } from '../auth';
import type { Ctx } from '../context';
import { readImport } from '../importer';
import { join, mimeOf } from '../storage/types';

export function publishRoutes(ctx: Ctx) {
  const app = new Hono<AppEnv>();

  app.get('/hosts', async (c) => c.json(await ctx.publisher.hosts()));
  app.post('/hosts', async (c) => {
    const body = await c.req.json<{ id?: string; kind: HostKind; name: string; target: string; domain?: string; token?: string }>();
    if (!body.target?.trim()) return c.json({ error: 'Target is required' }, 400);
    if (body.kind === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(body.target)) return c.json({ error: 'Use owner/repository' }, 400);
    if (body.kind === 'cloudflare' && !/^[\w-]+\/[\w-]+$/.test(body.target)) return c.json({ error: 'Use account-id/project-name' }, 400);
    return c.json(await ctx.publisher.saveHost(body));
  });
  app.delete('/hosts/:id', async (c) => {
    await ctx.publisher.removeHost(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.get('/boards/:sid/:slug/publish/files', async (c) => c.json(await ctx.publisher.publicFiles(c.req.param('sid'), c.req.param('slug'))));
  app.post('/boards/:sid/:slug/publish', async (c) => c.json(await ctx.publisher.publish(c.req.param('sid'), c.req.param('slug'), await c.req.json<PublishRequest>())));
  app.delete('/boards/:sid/:slug/publish', async (c) => c.json({ board: await ctx.publisher.unpublish(c.req.param('sid'), c.req.param('slug')) }));

  /** "Download .zip": board.json + media/ + plugins/ + the static HTML under published/. */
  app.get('/boards/:sid/:slug/export', async (c) => {
    const sid = c.req.param('sid');
    const slug = c.req.param('slug');
    const a = await ctx.storages.adapter(sid);
    const tree: Record<string, Uint8Array> = {};
    for (const f of await ctx.boards.files(sid, slug)) {
      if (f.path.startsWith('published/')) continue;
      const data = await a.read(join(slug, f.path));
      if (data) tree[`${slug}/${f.path}`] = data;
    }
    const { files } = await ctx.publisher.build(sid, slug);
    for (const [p, data] of files) tree[`${slug}/published/${p}`] = data;
    return c.body(zipSync(tree, { level: 1 }) as Uint8Array<ArrayBuffer>, 200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${slug}.zip"` });
  });

  app.post('/boards/import', async (c) => {
    const name = c.req.query('name') ?? 'import.md';
    const sid = c.req.query('storageId') ?? (await ctx.storages.all()).find((s) => s.isDefault)?.id;
    if (!sid) return c.json({ error: 'Connect a storage first' }, 400);
    const { board, media } = readImport(name, new Uint8Array(await c.req.arrayBuffer()));
    const created = await ctx.boards.create(sid, board.title);
    for (const [p, data] of media) await (await ctx.storages.adapter(sid)).write(join(created.slug, p), data, mimeOf(p));
    const saved = await ctx.boards.save(sid, created.slug, { ...board, id: created.id, slug: created.slug, visibility: 'draft', publish: undefined }, created.rev);
    await ctx.store.logActivity(`Imported ${name}`, saved.title);
    return c.json({ storageId: sid, board: saved });
  });

  return app;
}

/**
 * Public viewer for boards published as storage share links: `/s/<storage>/<slug>/…` serves
 * the `published/` copy straight from the user's storage. No sign-in; drafts are never served.
 */
export function shareRoutes(ctx: Ctx) {
  const app = new Hono();
  app.get('/s/:sid/:slug', (c) => c.redirect(`${c.req.path}/`));
  app.get('/s/:sid/:slug/*', async (c) => {
    const sid = c.req.param('sid');
    const slug = slugify(c.req.param('slug'));
    const rest = c.req.path.split(`/s/${sid}/${c.req.param('slug')}/`)[1] || 'index.html';
    const board = await ctx.boards.get(sid, slug).catch(() => null);
    if (!board) return c.html(statePage('404', 'This board is <em>not here</em>', 'It may have been moved, renamed or unpublished.'), 404);
    if (board.visibility === 'draft' || board.publish?.target !== 'share') return c.html(statePage('Private board', 'This board is <em>private</em>', 'Its author has not published it. Ask them for a share link.'), 403);
    const data = await (await ctx.storages.adapter(sid)).read(join(slug, 'published', decodeURIComponent(rest)));
    if (!data) return c.notFound();
    return c.body(data as Uint8Array<ArrayBuffer>, 200, { 'content-type': mimeOf(rest), 'cache-control': 'public, max-age=60', ...(board.visibility === 'unlisted' ? { 'x-robots-tag': 'noindex' } : {}) });
  });
  return app;
}

/** Minimal styled page for 404 and private boards (system states 4v, 4w). */
function statePage(code: string, title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${code} · Specimen</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Newsreader:ital@0;1&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf8f4;color:#1a1a1a;font-family:Newsreader,serif;padding:16px}@media(prefers-color-scheme:dark){body{background:#1b1916;color:#ede8df}}
.l{font:500 11px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#e4572e}h1{font:400 56px/1 'Instrument Serif',serif;margin:14px 0}em{color:#1f6f6b}p{font-size:19px;color:#6b6b6b;max-width:30em}a{font:500 12px 'JetBrains Mono',monospace;color:#8c857a}</style></head>
<body><main><div class="l">${code}</div><h1>${title}</h1><p>${body}</p><a href="https://github.com/specimen-dev/specimen">Made with Specimen (open source)</a></main></body></html>`;
}
