import { unzipSync } from 'fflate';
import { emptyBoard, parseBoard, uid, type Board, type Card } from '@specimen/schema';
import { dec } from './storage/types';

/** Cards laid out in a section, three columns wide, in reading order. */
const COLS = 3;
const CARD_W = 240;
const GAP = 20;

/**
 * Markdown → board. Each `#`/`##` heading starts a section; paragraphs become notes, lines that
 * are only a link become link cards, images become image cards, fenced code becomes code cards,
 * `$$…$$` becomes math and `> quotes` become quotes.
 */
export function boardFromMarkdown(md: string, fallbackTitle: string): Board {
  const now = Date.now();
  const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallbackTitle;
  const b = emptyBoard(title);
  type Sec = { id: string; title: string; cards: Card[] };
  let section = null as Sec | null;
  const sections: Sec[] = [];
  const base = { tags: [], private: false, w: CARD_W, x: 0, y: 0, createdAt: now, updatedAt: now };
  const push = (c: Record<string, unknown>) => {
    if (!section) {
      section = { id: uid('s_'), title: 'Notes', cards: [] };
      sections.push(section);
    }
    section.cards.push({ ...base, id: uid('c_'), sectionId: section.id, ...c } as unknown as Card);
  };
  const blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}(?=(?:[^`]*`{3}[^`]*`{3})*[^`]*$)/);
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const h = block.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      if (h[1].length === 1 && block === md.match(/^#\s+.+$/m)?.[0]) continue;
      section = { id: uid('s_'), title: h[2].trim(), cards: [] };
      sections.push(section);
      continue;
    }
    const fence = block.match(/^```(\w*)\n([\s\S]*?)\n?```$/);
    if (fence) push({ type: 'code', lang: fence[1] || 'text', code: fence[2], highlight: [] });
    else if (/^\$\$[\s\S]+\$\$$/.test(block)) push({ type: 'math', tex: block.slice(2, -2).trim() });
    else if (/^!\[[^\]]*\]\([^)]+\)$/.test(block)) {
      const [, alt, src] = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)!;
      push({ type: 'image', src, alt, caption: alt || undefined });
    } else if (/^\[[^\]]+\]\(https?:[^)]+\)$/.test(block) || /^https?:\/\/\S+$/.test(block)) {
      const m = block.match(/^\[([^\]]+)\]\((https?:[^)]+)\)$/);
      push({ type: 'link', url: m ? m[2] : block, title: m?.[1] });
    } else if (block.startsWith('>')) push({ type: 'quote', text: block.replace(/^>\s?/gm, '') });
    else push({ type: block.endsWith('?') ? 'question' : 'note', text: block.replace(/\n/g, ' ') });
  }
  // Lay sections out left to right; cards in a grid inside each.
  let x = 0;
  for (const s of sections) {
    const rows = Math.ceil(s.cards.length / COLS) || 1;
    const w = COLS * (CARD_W + GAP) + GAP;
    const h = 40 + rows * 140 + GAP;
    s.cards.forEach((c, i) => Object.assign(c, { x: x + GAP + (i % COLS) * (CARD_W + GAP), y: 40 + Math.floor(i / COLS) * 140 }));
    b.sections.push({ id: s.id, title: s.title, x, y: 0, w, h });
    b.trail.push(s.id);
    b.cards.push(...s.cards);
    x += w + GAP;
  }
  return b;
}

export interface ImportResult {
  board: Board;
  /** Board-relative media files to write next to `board.json`. */
  media: Map<string, Uint8Array>;
}

/**
 * Reads an import upload: a Specimen `.zip` (board.json + media/), a board `.json`, one `.md`
 * file, or a `.zip` of Markdown files (one board, a section per file heading).
 */
export function readImport(name: string, data: Uint8Array): ImportResult {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) return { board: parseBoard(JSON.parse(dec.decode(data))), media: new Map() };
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')) return { board: boardFromMarkdown(dec.decode(data), name.replace(/\.\w+$/, '')), media: new Map() };
  if (!lower.endsWith('.zip')) throw Object.assign(new Error('Drop a Markdown file or folder (.zip), a .json board or a Specimen .zip'), { status: 400 });

  const files = unzipSync(data);
  // Zips often wrap everything in one top folder; strip it.
  const paths = Object.keys(files).filter((p) => !p.endsWith('/') && !p.includes('__MACOSX'));
  const prefix = paths.every((p) => p.split('/').length > 1 && p.split('/')[0] === paths[0].split('/')[0]) ? `${paths[0].split('/')[0]}/` : '';
  const rel = (p: string) => p.slice(prefix.length);
  const boardFile = paths.find((p) => rel(p) === 'board.json');
  if (boardFile) {
    const media = new Map<string, Uint8Array>();
    for (const p of paths) if (rel(p).startsWith('media/')) media.set(rel(p), files[p]);
    return { board: parseBoard(JSON.parse(dec.decode(files[boardFile]))), media };
  }
  const mds = paths.filter((p) => /\.(md|markdown)$/i.test(p)).sort();
  if (!mds.length) throw Object.assign(new Error('The zip has no board.json and no Markdown files'), { status: 400 });
  const combined = mds.map((p) => {
    const text = dec.decode(files[p]);
    return /^#{1,2}\s/m.test(text) ? text : `## ${rel(p).replace(/\.\w+$/, '')}\n\n${text}`;
  });
  return { board: boardFromMarkdown(combined.join('\n\n'), name.replace(/\.zip$/i, '')), media: new Map() };
}
