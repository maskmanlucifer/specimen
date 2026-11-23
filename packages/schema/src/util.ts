import { BOARD_FORMAT_VERSION, type Board, type Card, type CardType } from './board';

/** Short, URL-safe random id. Collisions are irrelevant at board scale (hundreds of cards). */
export function uid(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let s = '';
  for (const b of bytes) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36];
  return prefix + s;
}

/** "How Shazam works?" → "how-shazam-works". */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled-board'
  );
}

/** A new, empty board. */
export function emptyBoard(title: string, author?: string): Board {
  const now = Date.now();
  return {
    format: BOARD_FORMAT_VERSION,
    id: uid('b_'),
    slug: slugify(title),
    title,
    author,
    visibility: 'draft',
    createdAt: now,
    updatedAt: now,
    rev: 0,
    sections: [],
    cards: [],
    links: [],
    trail: [],
    plugins: {},
    log: [],
    excludeMedia: [],
  };
}

/** Upper-case mono label shown at the top of each card ("NOTE", "FIG. 1 · …"). */
export const CARD_LABEL: Record<CardType, string> = {
  note: 'Note',
  fact: 'Fact',
  question: 'Question',
  quote: 'Quote',
  link: 'Link',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  document: 'PDF',
  code: 'Code',
  math: 'Math',
  figure: 'Figure',
};

/** The main text of a card, for search, the log and the ⌘K palette. */
export function cardText(card: Card): string {
  switch (card.type) {
    case 'note':
    case 'fact':
    case 'question':
    case 'quote':
      return card.text;
    case 'link':
      return [card.title, card.url, card.description].filter(Boolean).join(' ');
    case 'image':
      return [card.caption, card.alt, card.src].filter(Boolean).join(' ');
    case 'audio':
      return [card.title, ...card.markers.map((m) => m.label), ...card.transcript.map((l) => l.text)].join(' ');
    case 'video':
    case 'document':
      return card.title;
    case 'code':
      return card.code;
    case 'math':
      return card.tex;
    case 'figure':
      return [card.title, card.caption, card.plugin].filter(Boolean).join(' ');
  }
}

/** All media paths a board references (relative to the board folder). */
export function mediaPaths(board: Board): string[] {
  const out = new Set<string>();
  const add = (p?: string) => p && !/^[a-z]+:/i.test(p) && out.add(p);
  for (const c of board.cards) {
    if ('src' in c) add(c.src);
    if (c.type === 'figure') add(c.still);
    if (c.type === 'video') add(c.poster);
    if (c.type === 'link') add(c.image);
  }
  add(board.cover);
  return [...out];
}

/** `1536` → `"1.5 KB"`. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** `63.2` → `"1:03.2"`; with `precise=false` → `"1:03"`. */
export function formatTime(sec: number, precise = true): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const ss = precise ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  return `${m}:${ss}`;
}
