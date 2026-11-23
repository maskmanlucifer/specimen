import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { createApp } from './index';

let app: Awaited<ReturnType<typeof createApp>>['app'];
let dir: string;
const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'specimen-'));
  ({ app } = await createApp(loadConfig({ DATA_DIR: dir, SECRET: 'test' })));
});
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

describe('api', () => {
  it('reports a session with the implicit user in AUTH=none', async () => {
    const s = await (await app.request('/api/session')).json();
    expect(s.authMode).toBe('none');
    expect(s.user.name).toBe('You');
  });

  it('creates, reads and saves a board, and detects conflicts', async () => {
    const created = await (await app.request('/api/boards', json({ title: 'How Shazam works', template: 'how-shazam-works' }))).json();
    expect(created.board.slug).toBe('how-shazam-works');
    expect(created.board.cards.length).toBe(25);

    const url = `/api/boards/${created.storageId}/how-shazam-works`;
    const { board } = await (await app.request(url)).json();
    const put = (b: unknown, baseRev: number) => app.request(url, { ...json({ board: b, baseRev }), method: 'PUT' });

    const saved = await (await put({ ...board, title: 'Renamed' }, board.rev)).json();
    expect(saved.board.rev).toBe(board.rev + 1);

    const stale = await put({ ...board, title: 'Stale' }, board.rev);
    expect(stale.status).toBe(409);
    expect((await stale.json()).current.title).toBe('Renamed');

    const list = await (await app.request('/api/boards')).json();
    expect(list.boards[0].title).toBe('Renamed');
  });

  it('uploads media in chunks and serves byte ranges', async () => {
    const base = '/api/boards/local/how-shazam-works';
    const data = new Uint8Array(100).map((_, i) => i);
    const send = (offset: number, part: Uint8Array) => app.request(`${base}/upload?id=u1&name=clip.mp3&offset=${offset}&total=100`, { method: 'POST', body: part as Uint8Array<ArrayBuffer> });
    expect((await (await send(0, data.subarray(0, 60))).json()).received).toBe(60);
    const done = await (await send(60, data.subarray(60))).json();
    expect(done.src).toBe('media/clip.mp3');

    const res = await app.request(`${base}/${done.src}`, { headers: { range: 'bytes=10-19' } });
    expect(res.status).toBe(206);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('rejects paths that escape the storage root', async () => {
    const res = await app.request('/api/boards/local/..%2F..%2Fetc/media/passwd');
    expect(res.status).toBe(400);
  });

  it('tests a local storage connection', async () => {
    const target = path.join(dir, 'other');
    const r = await (await app.request('/api/storages/test', json({ kind: 'local', credentials: { path: target } }))).json();
    expect(r).toMatchObject({ ok: true, checks: { read: true, write: true, list: true } });
  });
});
