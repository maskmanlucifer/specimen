import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import nodemailer from 'nodemailer';
import { uid, type User } from '@specimen/schema';
import type { Config } from './config';
import { safeEqual, token } from './crypto';
import type { Store } from './store';

const COOKIE = 'specimen_session';
const SESSION_DAYS = 30;
const MAGIC_MINUTES = 15;

export type AppEnv = { Variables: { user: User } };

/**
 * Sessions and the three sign-in modes:
 * - `none`: one implicit user, no screen (a laptop install).
 * - `password`: one user, one shared password from the `PASSWORD` env var.
 * - `hosted`: many users via Google, GitHub or an email link.
 */
export class Auth {
  constructor(
    private readonly store: Store,
    private readonly cfg: Config,
  ) {}

  /** The single user for `none`/`password` modes, created on first use. */
  async owner(): Promise<User> {
    const s = await this.store.read();
    if (s.users[0]) return s.users[0];
    return this.store.update((st) => {
      const u = { id: uid('u_'), name: 'You', handle: 'me', methods: [], createdAt: Date.now() };
      st.users.push(u);
      return u;
    });
  }

  async userFor(sessionToken?: string): Promise<User | null> {
    if (this.cfg.auth === 'none') return this.owner();
    if (!sessionToken) return null;
    const s = await this.store.read();
    const sess = s.sessions.find((x) => x.token === sessionToken && x.expires > Date.now());
    return (sess && s.users.find((u) => u.id === sess.userId)) || null;
  }

  async startSession(c: Parameters<typeof setCookie>[0], userId: string) {
    const t = token();
    await this.store.update((s) => {
      s.sessions = s.sessions.filter((x) => x.expires > Date.now());
      s.sessions.push({ token: t, userId, expires: Date.now() + SESSION_DAYS * 864e5 });
    });
    setCookie(c, COOKIE, t, { httpOnly: true, sameSite: 'Lax', path: '/', secure: this.cfg.publicUrl.startsWith('https'), maxAge: SESSION_DAYS * 86400 });
  }

  async endSession(c: Parameters<typeof getCookie>[0]) {
    const t = getCookie(c, COOKIE);
    await this.store.update((s) => {
      s.sessions = s.sessions.filter((x) => x.token !== t);
    });
    deleteCookie(c, COOKIE, { path: '/' });
  }

  /** `AUTH=password`: compares in constant time. */
  checkPassword(pw: string): boolean {
    return !!this.cfg.password && safeEqual(pw, this.cfg.password);
  }

  /**
   * Finds or creates the user for a verified identity. The same buttons create an account and sign in.
   */
  async upsertUser(method: User['methods'][number]['kind'], email: string, name?: string): Promise<User> {
    return this.store.update((s) => {
      const label = `${method === 'email' ? 'Email link' : method === 'google' ? 'Google' : 'GitHub'} · ${email}`;
      let u = s.users.find((x) => x.email === email);
      if (!u) {
        const handle = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        u = { id: uid('u_'), name: name ?? handle, handle, email, methods: [], createdAt: Date.now() };
        s.users.push(u);
      }
      if (!u.methods.some((m) => m.kind === method)) u.methods.push({ kind: method, label });
      return u;
    });
  }

  /** Emails a one-time sign-in link. Without SMTP configured, it is printed to the server log. */
  async sendMagicLink(email: string) {
    const t = token();
    await this.store.update((s) => {
      s.magic = s.magic.filter((m) => m.expires > Date.now());
      s.magic.push({ token: t, email: email.toLowerCase(), expires: Date.now() + MAGIC_MINUTES * 60_000 });
    });
    const link = `${this.cfg.publicUrl}/api/auth/email/verify?token=${t}`;
    if (!this.cfg.smtpUrl) {
      console.log(`[auth] sign-in link for ${email}: ${link}`);
      return;
    }
    await nodemailer.createTransport(this.cfg.smtpUrl).sendMail({
      from: this.cfg.mailFrom,
      to: email,
      subject: 'Your Specimen sign-in link',
      text: `Open this link to sign in. It works for ${MAGIC_MINUTES} minutes.\n\n${link}\n\nIf you did not ask for it, ignore this email.`,
    });
  }

  /** Spends a magic-link token. Returns the email, or null when it is unknown or expired. */
  async consumeMagic(t: string): Promise<string | null> {
    return this.store.update((s) => {
      const m = s.magic.find((x) => x.token === t && x.expires > Date.now());
      s.magic = s.magic.filter((x) => x.token !== t);
      return m?.email ?? null;
    });
  }

  /** Middleware: attaches the user or answers 401. */
  required() {
    return createMiddleware<AppEnv>(async (c, next) => {
      const user = await this.userFor(getCookie(c, COOKIE));
      if (!user) return c.json({ error: 'Sign in required' }, 401);
      c.set('user', user);
      await next();
    });
  }

  cookie(c: Parameters<typeof getCookie>[0]) {
    return getCookie(c, COOKIE);
  }
}
