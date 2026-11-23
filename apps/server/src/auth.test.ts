import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';
import { createApp } from './index';

const dirs: string[] = [];
async function app(env: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'specimen-auth-'));
  dirs.push(dir);
  return (await createApp(loadConfig({ DATA_DIR: dir, SECRET: 'test', ...env }))).app;
}
afterAll(() => Promise.all(dirs.map((d) => fs.rm(d, { recursive: true, force: true }))));
const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? '';

describe('AUTH=password', () => {
  it('requires the password before any board API', async () => {
    const a = await app({ AUTH: 'password', PASSWORD: 'hunter2' });
    expect((await a.request('/api/boards')).status).toBe(401);
    expect((await a.request('/api/auth/password', json({ password: 'nope' }))).status).toBe(401);
    const ok = await a.request('/api/auth/password', json({ password: 'hunter2' }));
    expect(ok.status).toBe(200);
    const cookie = cookieOf(ok);
    expect(cookie).toMatch(/^specimen_session=/);
    expect((await a.request('/api/boards', { headers: { cookie } })).status).toBe(200);
    await a.request('/api/auth/signout', { method: 'POST', headers: { cookie } });
    expect((await a.request('/api/boards', { headers: { cookie } })).status).toBe(401);
  });

  it('refuses to start without a PASSWORD', () => {
    expect(() => loadConfig({ AUTH: 'password' })).toThrow(/PASSWORD/);
  });
});

describe('AUTH=hosted email link', () => {
  it('signs in with a one-time link', async () => {
    const a = await app({ AUTH: 'hosted', PUBLIC_URL: 'http://x.test' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect((await a.request('/api/auth/email', json({ email: 'ana@example.com' }))).status).toBe(200);
    const link = String(log.mock.calls.flat().find((s) => String(s).includes('/api/auth/email/verify')));
    log.mockRestore();
    const token = link.match(/token=([\w-]+)/)![1];
    const res = await a.request(`/api/auth/email/verify?token=${token}`);
    expect(res.status).toBe(302);
    const cookie = cookieOf(res);
    const s = await (await a.request('/api/session', { headers: { cookie } })).json();
    expect(s.user.email).toBe('ana@example.com');
    // A link works once.
    expect((await a.request(`/api/auth/email/verify?token=${token}`)).headers.get('location')).toContain('link-expired');
  });

  it('rejects OAuth when the provider is not configured', async () => {
    const a = await app({ AUTH: 'hosted' });
    expect((await a.request('/api/auth/oauth/google')).status).toBe(400);
  });
});
