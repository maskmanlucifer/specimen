import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { zipSync } from 'fflate';
import { hostOf, mediaPaths, uid, type Board, type HostInfo, type HostKind, type PluginBundle, type PublicFile, type PublishRequest, type PublishResult } from '@specimen/schema';
import { renderStoryHtml } from '@specimen/story/ssr';
import type { Boards } from './boards';
import type { Config } from './config';
import { open, seal } from './crypto';
import type { Plugins } from './plugins';
import type { StorageRegistry } from './storage/registry';
import { enc, join, toBody } from './storage/types';
import type { Store, StoredHost } from './store';

const run = promisify(execFile);

/** Media above this size gets a warning in the publish dialog ("readers on phones will download all of it"). */
export const LARGE_MEDIA = 20 * 1024 * 1024;

type Files = Map<string, Uint8Array>;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The copy of a board that readers get: no private cards, no links to them, no research log,
 * no excluded media. Everything else is the same open format.
 */
export function publicBoard(b: Board): Board {
  const cards = b.cards.filter((c) => !c.private && !(('src' in c) && b.excludeMedia.includes(c.src)));
  const ids = new Set(cards.map((c) => c.id));
  return { ...b, cards, links: b.links.filter((l) => (ids.has(l.from) || b.sections.some((s) => s.id === l.from)) && (ids.has(l.to) || b.sections.some((s) => s.id === l.to))), log: [] };
}

/** The static `index.html`: server-rendered story + embedded data for hydration. */
export function pageHtml(board: Board, plugins: Record<string, PluginBundle>, base = ''): string {
  const body = renderStoryHtml(board, plugins);
  // `</script` inside JSON would end the data block early.
  const data = JSON.stringify({ board, plugins }).replace(/</g, '\\u003c');
  const desc = escapeHtml(board.dek ?? `${board.title}, an illustrated explanation.`);
  const cover = board.cover ? `<meta property="og:image" content="${escapeHtml(base + board.cover)}">` : '';
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(board.title)}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${escapeHtml(board.title)}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
${cover}
<meta name="generator" content="Specimen">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="katex/katex.min.css">
<link rel="stylesheet" href="reader.css">
<script>try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark'}catch(e){}</script>
<style>html,body{margin:0;background:var(--paper)}</style>
</head>
<body>
<div id="root">${body}</div>
<script id="specimen-data" type="application/json">${data}</script>
<script src="reader.js" defer></script>
</body>
</html>
`;
}

/** Builds static copies of boards and deploys them to the user's hosts. */
export class Publisher {
  constructor(
    private readonly cfg: Config,
    private readonly store: Store,
    private readonly storages: StorageRegistry,
    private readonly boards: Boards,
    private readonly plugins: Plugins,
  ) {}

  /** Files that become public, with sizes, for the "Files that become public" list. */
  async publicFiles(sid: string, slug: string): Promise<PublicFile[]> {
    const b = await this.boards.get(sid, slug);
    const pub = publicBoard({ ...b, excludeMedia: [] });
    const sizes = new Map((await this.boards.files(sid, slug)).map((f) => [f.path, f.size]));
    return mediaPaths(pub).map((p) => ({ path: p, size: sizes.get(p) ?? 0, excluded: b.excludeMedia.includes(p), missing: !sizes.has(p) }));
  }

  /** All files of the static copy, keyed by path relative to the board's public folder. */
  async build(sid: string, slug: string): Promise<{ board: Board; files: Files }> {
    const full = await this.boards.get(sid, slug);
    const board = publicBoard(full);
    const files: Files = new Map();
    const bundles: Record<string, PluginBundle> = {};
    for (const id of new Set(board.cards.flatMap((c) => (c.type === 'figure' ? [c.plugin] : [])))) {
      const p = await this.plugins.get(id);
      if (!p) continue;
      bundles[id] = p;
      files.set(`plugins/${id}/plugin.json`, enc.encode(JSON.stringify(p.manifest, null, 2)));
      files.set(`plugins/${id}/figure.js`, enc.encode(p.script));
      files.set(`plugins/${id}/style.css`, enc.encode(p.style));
    }
    for (const m of mediaPaths(board)) {
      const data = await this.boards.readMedia(sid, slug, m);
      if (data) files.set(m, data);
    }
    files.set('index.html', enc.encode(pageHtml(board, bundles)));
    files.set('board.json', enc.encode(JSON.stringify(board, null, 2)));
    await this.addReader(files);
    return { board, files };
  }

  private async addReader(files: Files) {
    const dir = this.cfg.readerDist;
    const walk = async (rel: string): Promise<void> => {
      for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(r);
        else files.set(r, new Uint8Array(await fs.readFile(path.join(dir, r))));
      }
    };
    try {
      await walk('');
    } catch {
      throw Object.assign(new Error('Reader bundle is missing. Run `pnpm --filter @specimen/story build`.'), { status: 500 });
    }
  }

  // ---------- Hosts ----------

  async hosts(): Promise<HostInfo[]> {
    return (await this.store.read()).hosts.map(({ secret, ...h }) => ({ ...h, connected: h.kind === 'folder' || !!secret }));
  }

  async saveHost(input: { id?: string; kind: HostKind; name: string; target: string; domain?: string; token?: string }): Promise<HostInfo> {
    const h = await this.store.update((s) => {
      const id = input.id ?? uid('h_');
      const prev = s.hosts.find((x) => x.id === id);
      const next: StoredHost = { id, kind: input.kind, name: input.name, target: input.target, domain: input.domain || undefined, secret: input.token ? seal(input.token) : prev?.secret };
      s.hosts = prev ? s.hosts.map((x) => (x.id === id ? next : x)) : [...s.hosts, next];
      return next;
    });
    return { id: h.id, kind: h.kind, name: h.name, target: h.target, domain: h.domain, connected: h.kind === 'folder' || !!h.secret };
  }

  async removeHost(id: string) {
    await this.store.update((s) => {
      s.hosts = s.hosts.filter((h) => h.id !== id);
    });
  }

  /** Publishes a board and records where it went. */
  async publish(sid: string, slug: string, req: PublishRequest): Promise<PublishResult & { board: Board }> {
    const { files } = await this.build(sid, slug);
    let url: string;
    if (req.via === 'share') url = await this.toStorage(sid, slug, files);
    else {
      const host = (await this.store.read()).hosts.find((h) => h.id === req.via);
      if (!host) throw Object.assign(new Error('Unknown host'), { status: 404 });
      url = await this.toHost({ ...host, domain: req.domain || host.domain }, slug, files);
    }
    const full = await this.boards.get(sid, slug);
    const saved = await this.boards.save(sid, slug, { ...full, visibility: req.visibility, publish: { target: req.via, url, at: Date.now(), cards: full.cards.filter((c) => !c.private).length }, log: [...full.log, { id: uid('e_'), at: Date.now(), action: 'published', text: `Published to ${url}` }] }, full.rev);
    await this.store.logActivity(`Published to ${req.via === 'share' ? 'share link' : hostOf(url) || url}`, full.title);
    let bytes = 0;
    for (const f of files.values()) bytes += f.byteLength;
    return { url, files: files.size, bytes, board: saved };
  }

  async unpublish(sid: string, slug: string): Promise<Board> {
    const full = await this.boards.get(sid, slug);
    const target = full.publish?.target;
    if (target === 'share') await (await this.storages.adapter(sid)).remove(join(slug, 'published'));
    else if (target) {
      const host = (await this.store.read()).hosts.find((h) => h.id === target);
      if (host) await this.toHost(host, slug, new Map());
    }
    return this.boards.save(sid, slug, { ...full, visibility: 'draft', publish: undefined }, full.rev);
  }

  /** "Share links from your storage": the copy lives in the board folder; this server is the viewer. */
  private async toStorage(sid: string, slug: string, files: Files): Promise<string> {
    const a = await this.storages.adapter(sid);
    await a.remove(join(slug, 'published'));
    for (const [p, data] of files) await a.write(join(slug, 'published', p), data);
    return `${this.cfg.publicUrl}/s/${sid}/${slug}/`;
  }

  /** A local mirror of everything published to one host. Static hosts redeploy the whole site. */
  private async mirror(host: StoredHost, slug: string, files: Files): Promise<string> {
    const dir = host.kind === 'folder' ? host.target : path.join(this.cfg.dataDir, 'hosts', host.id);
    const target = path.join(dir, slug);
    await fs.rm(target, { recursive: true, force: true });
    for (const [p, data] of files) {
      await fs.mkdir(path.dirname(path.join(target, p)), { recursive: true });
      await fs.writeFile(path.join(target, p), data);
    }
    return dir;
  }

  /** Deploys `files` under `<slug>/` on a host. An empty map removes the board (unpublish). */
  private async toHost(host: StoredHost, slug: string, files: Files): Promise<string> {
    const token = host.secret ? open<string>(host.secret) : '';
    const viaDomain = host.domain ? `https://${host.domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/${slug}/` : null;
    switch (host.kind) {
      case 'folder': {
        await this.mirror(host, slug, files);
        if (!files.size) await fs.rm(path.join(host.target, slug), { recursive: true, force: true });
        return viaDomain ?? `file://${path.join(host.target, slug, 'index.html')}`;
      }
      case 'github':
        await githubPages(token, host.target, slug, files);
        return viaDomain ?? `https://${host.target.split('/')[0]}.github.io/${host.target.split('/')[1]}/${slug}/`;
      case 'netlify': {
        const dir = await this.mirror(host, slug, files);
        await netlifyDeploy(token, host.target, dir);
        return viaDomain ?? `https://${host.target.includes('.') ? host.target : `${host.target}.netlify.app`}/${slug}/`;
      }
      case 'cloudflare': {
        const dir = await this.mirror(host, slug, files);
        const [account, project] = host.target.split('/');
        await run('npx', ['--yes', 'wrangler@3', 'pages', 'deploy', dir, '--project-name', project, '--branch', 'main', '--commit-dirty=true'], { env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account }, maxBuffer: 1e7 });
        return viaDomain ?? `https://${project}.pages.dev/${slug}/`;
      }
      case 'server': {
        const dir = await this.mirror(host, slug, files);
        await run('rsync', ['-az', '--delete', `${dir}/`, host.target], { maxBuffer: 1e7 });
        return viaDomain ?? host.target;
      }
    }
  }
}

/**
 * Commits the board under `<slug>/` on the `gh-pages` branch with the Git Data API:
 * blobs → tree (on top of the current one, removing stale files) → commit → move the ref.
 */
async function githubPages(token: string, repo: string, slug: string, files: Files) {
  const api = async <T>(p: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`https://api.github.com/repos/${repo}${p}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'specimen', 'content-type': 'application/json', ...init.headers } });
    if (!res.ok && res.status !== 404) throw Object.assign(new Error(`GitHub ${p}: ${res.status} ${await res.text()}`), { status: 502 });
    return (res.status === 404 ? null : await res.json()) as T;
  };
  const branch = 'gh-pages';
  const ref = await api<{ object: { sha: string } } | null>(`/git/ref/heads/${branch}`);
  const parent = ref?.object.sha;
  let baseTree: string | undefined;
  let existing: { path: string; type: string }[] = [];
  if (parent) {
    const commit = await api<{ tree: { sha: string } }>(`/git/commits/${parent}`);
    baseTree = commit.tree.sha;
    existing = (await api<{ tree: { path: string; type: string }[] }>(`/git/trees/${baseTree}?recursive=1`)).tree;
  }
  const entries: { path: string; mode: string; type: string; sha: string | null }[] = [];
  for (const [p, data] of files) {
    const blob = await api<{ sha: string }>('/git/blobs', { method: 'POST', body: JSON.stringify({ content: Buffer.from(data).toString('base64'), encoding: 'base64' }) });
    entries.push({ path: `${slug}/${p}`, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const keep = new Set(entries.map((e) => e.path));
  for (const e of existing) if (e.type === 'blob' && e.path.startsWith(`${slug}/`) && !keep.has(e.path)) entries.push({ path: e.path, mode: '100644', type: 'blob', sha: null });
  if (!existing.some((e) => e.path === '.nojekyll')) {
    const blob = await api<{ sha: string }>('/git/blobs', { method: 'POST', body: JSON.stringify({ content: '', encoding: 'utf-8' }) });
    entries.push({ path: '.nojekyll', mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await api<{ sha: string }>('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree: entries }) });
  const commit = await api<{ sha: string }>('/git/commits', { method: 'POST', body: JSON.stringify({ message: files.size ? `Publish ${slug}` : `Unpublish ${slug}`, tree: tree.sha, parents: parent ? [parent] : [] }) });
  if (parent) await api(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
  else await api('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) });
}

/** Zips the host mirror and deploys it as the whole Netlify site. */
async function netlifyDeploy(token: string, site: string, dir: string) {
  const tree: Record<string, Uint8Array> = {};
  const walk = async (rel: string): Promise<void> => {
    for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else tree[r] = new Uint8Array(await fs.readFile(path.join(dir, r)));
    }
  };
  await walk('');
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(site)}/deploys`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/zip' }, body: toBody(zipSync(tree)) });
  if (!res.ok) throw Object.assign(new Error(`Netlify: ${res.status} ${await res.text()}`), { status: 502 });
}
