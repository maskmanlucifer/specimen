import type { Board, Card, Section } from './board';

/**
 * The reader's view of a board: sections in trail order, cards in reading order,
 * figures numbered, sources collected as footnotes. Pure function of the board, shared by
 * the in-app Preview and the static export so both render the same story.
 */
export interface Story {
  title: string;
  dek?: string;
  author?: string;
  minutes: number;
  sections: StorySection[];
  footnotes: Footnote[];
}

export interface StorySection {
  section: Section;
  /** 1-based position in the trail. */
  n: number;
  blocks: StoryBlock[];
  /** Cards linked from this section's cards into other sections. Shown as "Related". */
  related: { title: string; sectionId: string }[];
}

export type StoryBlock =
  | { kind: 'card'; card: Card; footnote?: number }
  | { kind: 'figure'; card: Extract<Card, { type: 'figure' }>; figure: number };

export interface Footnote {
  n: number;
  label: string;
  url?: string;
  locator?: string;
}

/** Cards in natural reading order inside a section: top-to-bottom rows, then left-to-right. */
function readingOrder(a: Card, b: Card): number {
  const row = 40;
  const dy = Math.round(a.y / row) - Math.round(b.y / row);
  return dy !== 0 ? dy : a.x - b.x;
}

/** Sections in trail order; sections missing from the trail follow in canvas order. */
export function orderedSections(board: Board): Section[] {
  const byId = new Map(board.sections.map((s) => [s.id, s]));
  const listed = board.trail.map((id) => byId.get(id)).filter((s): s is Section => !!s);
  const rest = board.sections
    .filter((s) => !board.trail.includes(s.id))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return [...listed, ...rest];
}

function wordsOf(card: Card): number {
  const text = 'text' in card ? card.text : 'caption' in card ? (card.caption ?? '') : '';
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Builds the published story. Private cards and cards outside any section are left out.
 *
 * @param board - The full board.
 * @returns The reader model.
 */
export function buildStory(board: Board): Story {
  const footnotes: Footnote[] = [];
  const footnoteKey = new Map<string, number>();
  let figure = 0;
  let words = (board.dek ?? '').split(/\s+/).length;
  const publicCards = board.cards.filter((c) => !c.private);
  const sectionOf = new Map(publicCards.map((c) => [c.id, c.sectionId]));

  const sections = orderedSections(board).map((section, i): StorySection => {
    const cards = publicCards.filter((c) => c.sectionId === section.id).sort(readingOrder);
    const blocks = cards.map((card): StoryBlock => {
      words += wordsOf(card);
      if (card.type === 'figure') return { kind: 'figure', card, figure: ++figure };
      if (!card.source?.url && !card.source?.label) return { kind: 'card', card };
      const key = `${card.source.url ?? ''}|${card.source.label ?? ''}`;
      let n = footnoteKey.get(key);
      if (!n) {
        n = footnotes.length + 1;
        footnoteKey.set(key, n);
        footnotes.push({ n, label: card.source.label ?? hostOf(card.source.url), url: card.source.url, locator: card.source.locator });
      }
      return { kind: 'card', card, footnote: n };
    });
    const ids = new Set(cards.map((c) => c.id));
    const relatedIds = new Set<string>();
    for (const l of board.links) {
      if (!ids.has(l.from)) continue;
      const target = sectionOf.get(l.to) ?? (board.sections.some((s) => s.id === l.to) ? l.to : null);
      if (target && target !== section.id) relatedIds.add(target);
    }
    const related = [...relatedIds]
      .map((id) => board.sections.find((s) => s.id === id))
      .filter((s): s is Section => !!s)
      .map((s) => ({ title: s.title, sectionId: s.id }));
    return { section, n: i + 1, blocks, related };
  });

  return {
    title: board.title,
    dek: board.dek,
    author: board.author,
    minutes: Math.max(1, Math.round(words / 220) + figure),
    sections,
    footnotes,
  };
}

/** `https://www.ieee.org/x` → `ieee.org`. Returns the input for non-URLs. */
export function hostOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
