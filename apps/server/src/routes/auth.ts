import { Hono } from 'hono';
import type { Session } from '@specimen/schema';
import type { Ctx } from '../context';
import { token } from '../crypto';
import { authorizeUrl, exchangeCode, type OAuthProvider } from '../oauth';

/**
 * OAuth round-trips in flight, keyed by `state`. Kept in memory: a server restart
 * mid-login only means clicking the button again.
 */
const pending = new Map<string, { provider: OAuthProvider; purpose: 'signin' | 'storage'; storageId?: string; root?: string; expires: number }>();

/** Starts an OAuth flow and returns the provider URL to redirect to. */
export function beginOAuth(ctx: Ctx, provider: OAuthProvider, purpose: 'signin' | 'storage', extra: { storageId?: string; root?: string } = {}): string {
  const clientKey = provider === 'gdrive' ? 'google' : (provider as 'google' | 'github' | 'dropbox' | 'onedrive');
  const client = ctx.cfg.oauth[clientKey];
  if (!client) throw Object.assign(new Error(`${provider} is not configured. Set ${clientKey.toUpperCase()}_CLIENT_ID and _CLIENT_SECRET.`), { status: 400 });
  const state = token(16);
  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
  pending.set(state, { provider, purpose, ...extra, expires: Date.now() + 10 * 60_000 });
  return authorizeUrl(provider, client, `${ctx.cfg.publicUrl}/api/oauth/callback`, state);
}

async function identity(provider: OAuthProvider, accessToken: string): Promise<{ email: string; name?: string }> {
  if (provider === 'github') {
    const h = { authorization: `Bearer ${accessToken}`, 'user-agent': 'specimen' };
    const user = (await (await fetch('https://api.github.com/user', { headers: h })).json()) as { name?: string; login: string };
    const emails = (await (await fetch('https://api.github.com/user/emails', { headers: h })).json()) as { email: string; primary: boolean; verified: boolean }[];
    const email = emails.find((e) => e.primary && e.verified)?.email;
    if (!email) throw new Error('GitHub account has no verified email');
    return { email, name: user.name ?? user.login };
  }
  if (provider === 'dropbox') {
    const me = (await (await fetch('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST', headers: { authorization: `Bearer ${accessToken}` } })).json()) as { email: string; name: { display_name: string } };
    return { email: me.email, name: me.name.display_name };
  }
  if (provider === 'onedrive') {
    const me = (await (await fetch('https://graph.microsoft.com/v1.0/me', { headers: { authorization: `Bearer ${accessToken}` } })).json()) as { mail?: string; userPrincipalName: string; displayName: string };
    return { email: me.mail ?? me.userPrincipalName, name: me.displayName };
  }
  const me = (await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })).json()) as { email: string; name?: string };
  return { email: me.email, name: me.name };
}

export function authRoutes(ctx: Ctx) {
  const app = new Hono();

  app.get('/session', async (c) => {
    const s = await ctx.store.read();
    const user = await ctx.auth.userFor(ctx.auth.cookie(c));
    const o = ctx.cfg.oauth;
    const body: Session = {
      user,
      authMode: ctx.cfg.auth,
      version: ctx.cfg.version,
      providers: { google: !!o.google, github: !!o.github, dropbox: !!o.dropbox, onedrive: !!o.onedrive, email: ctx.cfg.auth === 'hosted' },
      dataDir: ctx.cfg.dataDir,
      onboarded: s.onboarded,
    };
    return c.json(body);
  });

  /** Built-in plugin sources are public (MIT, in the repo). The landing page demo uses them. */
  app.get('/public/plugins/:id', async (c) => {
    const p = await ctx.plugins.builtIn(c.req.param('id'));
    return p ? c.json(p) : c.json({ error: 'Plugin not found' }, 404);
  });

  app.post('/auth/password', async (c) => {
    if (ctx.cfg.auth !== 'password') return c.json({ error: 'Password sign-in is off' }, 400);
    const { password } = await c.req.json<{ password: string }>();
    if (!ctx.auth.checkPassword(password ?? '')) return c.json({ error: 'Wrong password' }, 401);
    await ctx.auth.startSession(c, (await ctx.auth.owner()).id);
    return c.json({ ok: true });
  });

  app.post('/auth/email', async (c) => {
    if (ctx.cfg.auth !== 'hosted') return c.json({ error: 'Email sign-in is off' }, 400);
    const { email } = await c.req.json<{ email: string }>();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? '')) return c.json({ error: 'Enter a valid email' }, 400);
    await ctx.auth.sendMagicLink(email);
    return c.json({ ok: true });
  });

  app.get('/auth/email/verify', async (c) => {
    const email = await ctx.auth.consumeMagic(c.req.query('token') ?? '');
    if (!email) return c.redirect('/signin?error=link-expired');
    const user = await ctx.auth.upsertUser('email', email);
    await ctx.auth.startSession(c, user.id);
    return c.redirect('/boards');
  });

  app.get('/auth/oauth/:provider', (c) => {
    const p = c.req.param('provider');
    if (p !== 'google' && p !== 'github') return c.json({ error: 'Unknown provider' }, 404);
    return c.redirect(beginOAuth(ctx, p, 'signin'));
  });

  app.post('/auth/signout', async (c) => {
    await ctx.auth.endSession(c);
    return c.json({ ok: true });
  });

  /** One callback for every provider and purpose; `state` says which flow it belongs to. */
  app.get('/oauth/callback', async (c) => {
    const flow = pending.get(c.req.query('state') ?? '');
    pending.delete(c.req.query('state') ?? '');
    if (!flow || flow.expires < Date.now()) return c.redirect('/signin?error=state');
    if (c.req.query('error')) return c.redirect(flow.purpose === 'signin' ? '/signin?error=denied' : '/onboarding?error=denied');
    const clientKey = flow.provider === 'gdrive' ? 'google' : (flow.provider as 'google' | 'github' | 'dropbox' | 'onedrive');
    const tokens = await exchangeCode(flow.provider, ctx.cfg.oauth[clientKey]!, c.req.query('code') ?? '', `${ctx.cfg.publicUrl}/api/oauth/callback`);
    const who = await identity(flow.provider, tokens.access_token);

    if (flow.purpose === 'signin') {
      const user = await ctx.auth.upsertUser(flow.provider as 'google' | 'github', who.email, who.name);
      await ctx.auth.startSession(c, user.id);
      return c.redirect((await ctx.store.read()).onboarded ? '/boards' : '/onboarding');
    }
    const kind = flow.provider === 'gdrive' ? 'gdrive' : (flow.provider as 'dropbox' | 'onedrive');
    const st = await ctx.storages.save({ id: flow.storageId, kind, account: who.email, root: flow.root ?? '/Specimen', config: {}, secret: tokens });
    return c.redirect(`/onboarding?connected=${st.id}`);
  });

  return app;
}
