import { mediaPaths, type Board, type PluginBundle, type PublicFile } from '@specimen/schema';
import type { Boards } from './boards';
import type { DriveStorage } from './drive';
import { enc, join } from './files';
import type { Plugins } from './plugins';

/** Google Fonts stylesheet for published pages: the same "engineering manual" type as the app. */
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap';

/** The static reader (JS, CSS, KaTeX fonts), built by `@specimen/story` and bundled as URLs. */
const READER = import.meta.glob('../../../../packages/story/dist/**/*', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>;

type Files = Map<string, Uint8Array>;

/** What a share link points at: the public board with its plugins, in one Drive file. */
export interface SharedBoard {
  board: Board;
  plugins: Record<string, PluginBundle>;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The copy of a board that readers get: no private cards, no links to them, no research log,
 * no excluded media.
 */
export function publicBoard(b: Board): Board {
  const cards = b.cards.filter((c) => !c.private && !('src' in c && b.excludeMedia.includes(c.src)));
  const ids = new Set(cards.map((c) => c.id));
  const known = (id: string) => ids.has(id) || b.sections.some((s) => s.id === id);
  return { ...b, cards, links: b.links.filter((l) => known(l.from) && known(l.to)), log: [] };
}

/** The static `index.html`: pre-rendered story plus embedded data for hydration. */
async function pageHtml(board: Board, plugins: Record<string, PluginBundle>): Promise<string> {
  const { renderStoryHtml } = await import('@specimen/story/ssr');
  const body = renderStoryHtml(board, plugins);
  // `</script` inside JSON would end the data block early.
  const data = JSON.stringify({ board, plugins }).replace(/</g, '\\u003c');
  const desc = escapeHtml(board.dek ?? `${board.title}, an illustrated explanation.`);
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
<meta name="generator" content="Specimen">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS_URL}" rel="stylesheet">
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

/** Builds public copies of boards: a static folder (for any web host) or a Drive share link. */
export class Publisher {
  constructor(
    private readonly boards: Boards,
    private readonly plugins: Plugins,
    private readonly readMedia: (sid: string, slug: string, path: string) => Promise<Uint8Array | null>,
  ) {}

  /** Files that become public, with sizes, for the "Files that become public" list. */
  async publicFiles(sid: string, slug: string): Promise<PublicFile[]> {
    const b = await this.boards.get(sid, slug);
    const pub = publicBoard({ ...b, excludeMedia: [] });
    const sizes = new Map((await this.boards.files(sid, slug)).map((f) => [f.path, f.size]));
    return mediaPaths(pub).map((p) => ({ path: p, size: sizes.get(p) ?? 0, excluded: b.excludeMedia.includes(p), missing: !sizes.has(p) }));
  }

  private async bundles(board: Board) {
    const out: Record<string, PluginBundle> = {};
    for (const id of new Set(board.cards.flatMap((c) => (c.type === 'figure' ? [c.plugin] : [])))) {
      const p = await this.plugins.get(id);
      if (p) out[id] = p;
    }
    return out;
  }

  /** Every file of the static site for one board, keyed by path inside its folder. */
  async staticSite(sid: string, slug: string): Promise<Files> {
    const board = publicBoard(await this.boards.get(sid, slug));
    const plugins = await this.bundles(board);
    const files: Files = new Map();
    for (const [id, p] of Object.entries(plugins)) {
      files.set(`plugins/${id}/plugin.json`, enc.encode(JSON.stringify(p.manifest, null, 2)));
      files.set(`plugins/${id}/figure.js`, enc.encode(p.script));
      files.set(`plugins/${id}/style.css`, enc.encode(p.style));
    }
    for (const m of mediaPaths(board)) {
      const data = await this.readMedia(sid, slug, m);
      if (data) files.set(m, data);
    }
    files.set('index.html', enc.encode(await pageHtml(board, plugins)));
    files.set('board.json', enc.encode(JSON.stringify(board, null, 2)));
    for (const [p, url] of Object.entries(READER)) {
      const rel = p.split('/dist/')[1];
      const res = await fetch(await url());
      if (!res.ok) throw new Error('The reader bundle is missing from this build. Run `pnpm --filter @specimen/story build`.');
      files.set(rel, new Uint8Array(await res.arrayBuffer()));
    }
    return files;
  }

  /**
   * Publishes a Drive board as a share link: copies public media to `<slug>/published/`,
   * makes each copy readable by anyone with the link, and writes one `share.json`.
   *
   * @returns The Drive id of `share.json`, which the reader page loads.
   */
  async share(drive: DriveStorage, slug: string): Promise<string> {
    const board = publicBoard(await this.boards.get('gdrive', slug));
    const plugins = await this.bundles(board);
    await drive.remove(join(slug, 'published'));
    const ids = new Map<string, string>();
    for (const m of mediaPaths(board)) {
      const data = await this.readMedia('gdrive', slug, m);
      if (!data) continue;
      const target = join(slug, 'published', m);
      await drive.write(target, data);
      ids.set(m, await drive.share(target));
    }
    // Readers resolve `gdrive:<id>` with the public Drive API, so no path leaks the owner's folders.
    const shared: SharedBoard = {
      board: { ...board, cards: board.cards.map((c) => ('src' in c && ids.has(c.src) ? { ...c, src: `gdrive:${ids.get(c.src)}` } : c)) as Board['cards'] },
      plugins,
    };
    const target = join(slug, 'published', 'share.json');
    await drive.write(target, enc.encode(JSON.stringify(shared)), 'application/json');
    return drive.share(target);
  }
}
