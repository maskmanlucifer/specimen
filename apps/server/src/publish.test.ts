import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sampleBoards } from '@specimen/schema';
import { loadConfig } from './config';
import { boardFromMarkdown } from './importer';
import { createApp } from './index';
import { publicBoard } from './publish';

let app: Awaited<ReturnType<typeof createApp>>['app'];
let dir: string;
const post = (url: string, body: unknown) => app.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'specimen-pub-'));
  ({ app } = await createApp(loadConfig({ DATA_DIR: dir, SECRET: 'test' })));
  await post('/api/boards', { title: 'How compression works', template: 'how-compression-works' });
});
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

describe('publish', () => {
  it('drops private cards, links to them and the log', () => {
    const b = sampleBoards[0];
    const pub = publicBoard({ ...b, cards: b.cards.map((c) => (c.id === 'c1' ? { ...c, private: true } : c)) });
    expect(pub.cards.some((c) => c.id === 'c1')).toBe(false);
    expect(pub.links.some((l) => l.from === 'c1')).toBe(false);
    expect(pub.log).toEqual([]);
  });

  it('keeps drafts private on the share viewer', async () => {
    const res = await app.request('/s/local/how-compression-works/');
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('private');
  });

  it('publishes as a share link with server-rendered HTML', async () => {
    const res = await post('/api/boards/local/how-compression-works/publish', { via: 'share', visibility: 'unlisted' });
    const out = await res.json();
    expect(res.status).toBe(200);
    expect(out.url).toMatch(/\/s\/local\/how-compression-works\/$/);
    expect(out.board.visibility).toBe('unlisted');

    const page = await app.request('/s/local/how-compression-works/');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('How compression');
    expect(html).toMatch(/Fig\.\s*(<!-- -->)?1/);
    expect(html).toContain('specimen-data');
    expect((await app.request('/s/local/how-compression-works/reader.js')).status).toBe(200);
    expect((await app.request('/s/local/how-compression-works/plugins/tree-builder/figure.js')).status).toBe(200);
  });

  it('publishes to a folder host (the lucifer path)', async () => {
    const target = path.join(dir, 'site');
    const host = await (await post('/api/hosts', { kind: 'folder', name: 'Folder', target })).json();
    const out = await (await post('/api/boards/local/how-compression-works/publish', { via: host.id, visibility: 'published', domain: 'example.dev' })).json();
    expect(out.url).toBe('https://example.dev/how-compression-works/');
    const html = await fs.readFile(path.join(target, 'how-compression-works/index.html'), 'utf8');
    expect(html).toContain('<script src="reader.js" defer>');
    await fs.access(path.join(target, 'how-compression-works/katex/katex.min.css'));
  });

  it('unpublishes', async () => {
    const out = await (await app.request('/api/boards/local/how-compression-works/publish', { method: 'DELETE' })).json();
    expect(out.board.visibility).toBe('draft');
  });
});

describe('import', () => {
  it('turns Markdown headings into sections and blocks into cards', () => {
    const b = boardFromMarkdown('# Caching\n\n## Why\n\nMemory is slow.\n\nhttps://example.com\n\n## How\n\n```js\nconst x = 1;\n```\n\nIs it worth it?', 'x');
    expect(b.title).toBe('Caching');
    expect(b.sections.map((s) => s.title)).toEqual(['Why', 'How']);
    expect(b.cards.map((c) => c.type)).toEqual(['note', 'link', 'code', 'question']);
  });

  it('imports a Markdown file through the API', async () => {
    const res = await app.request('/api/boards/import?name=notes.md', { method: 'POST', body: '# Tides\n\n## Moon\n\nThe moon pulls the sea.' });
    const out = await res.json();
    expect(out.board.title).toBe('Tides');
    expect(out.board.cards).toHaveLength(1);
  });
});
