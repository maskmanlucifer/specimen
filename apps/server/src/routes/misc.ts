import { Hono } from 'hono';
import type { PluginBundle, Settings } from '@specimen/schema';
import type { AppEnv } from '../auth';
import type { Ctx } from '../context';

/** Reads `<meta property="og:…">` style tags without an HTML parser. */
function meta(html: string, ...names: string[]): string | undefined {
  for (const n of names) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']`, 'i')) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, 'i'));
    if (m) return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
}

/** Blocks link previews from reaching the server's own network (SSRF). */
function isPrivateHost(host: string): boolean {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i.test(host);
}

export function miscRoutes(ctx: Ctx) {
  const app = new Hono<AppEnv>();

  app.patch('/me', async (c) => {
    const body = await c.req.json<{ name?: string; handle?: string; bio?: string }>();
    const id = c.get('user').id;
    const user = await ctx.store.update((s) => {
      const u = s.users.find((x) => x.id === id)!;
      if (body.name !== undefined) u.name = body.name.slice(0, 80);
      if (body.handle !== undefined) u.handle = body.handle.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
      if (body.bio !== undefined) u.bio = body.bio.slice(0, 280);
      return u;
    });
    return c.json(user);
  });

  /** Deletes the sign-in and profile. Files in storage and copies on hosts stay. */
  app.delete('/me', async (c) => {
    const id = c.get('user').id;
    await ctx.store.update((s) => {
      s.users = s.users.filter((u) => u.id !== id);
      s.sessions = s.sessions.filter((x) => x.userId !== id);
    });
    return c.json({ ok: true });
  });

  app.get('/settings', async (c) => c.json((await ctx.store.read()).settings));
  app.patch('/settings', async (c) => {
    const body = await c.req.json<Partial<Settings>>();
    return c.json(await ctx.store.update((s) => Object.assign(s.settings, body)));
  });

  app.post('/onboarded', async (c) => {
    await ctx.store.update((s) => {
      s.onboarded = true;
    });
    return c.json({ ok: true });
  });

  app.get('/activity', async (c) => c.json((await ctx.store.read()).activity.slice(0, 12)));

  /** Link preview for the Link card: title, site, description, image. */
  app.get('/unfurl', async (c) => {
    const raw = c.req.query('url') ?? '';
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return c.json({ error: 'Invalid URL' }, 400);
    }
    if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) return c.json({ error: 'URL not allowed' }, 400);
    const site = url.hostname.replace(/^www\./, '');
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SpecimenBot/1.0)', accept: 'text/html' }, signal: AbortSignal.timeout(6000), redirect: 'follow' });
      const html = (await res.text()).slice(0, 300_000);
      const title = meta(html, 'og:title', 'twitter:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
      const image = meta(html, 'og:image', 'twitter:image');
      return c.json({ url: url.href, site, title, description: meta(html, 'og:description', 'description'), image: image ? new URL(image, url).href : undefined });
    } catch {
      return c.json({ url: url.href, site });
    }
  });

  app.get('/plugins', async (c) => c.json(await ctx.plugins.list()));
  app.get('/plugins/:id', async (c) => {
    const p = await ctx.plugins.get(c.req.param('id'));
    return p ? c.json(p) : c.json({ error: 'Plugin not found' }, 404);
  });
  app.put('/plugins/:id', async (c) => {
    const bundle = await c.req.json<PluginBundle>();
    if (bundle.manifest.id !== c.req.param('id')) return c.json({ error: 'Id mismatch' }, 400);
    await ctx.plugins.save(bundle);
    await ctx.store.logActivity(`Saved plugin ${bundle.manifest.name} ${bundle.manifest.version}`, 'Plugin');
    return c.json({ ok: true });
  });

  return app;
}
