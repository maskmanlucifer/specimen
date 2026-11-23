import type { Board, Section } from '@specimen/schema';

/** Space kept between a section and the one below it. */
const SECTION_GAP = 20;
/** Sections whose tops are this close count as one row and share a height. */
const ROW_TOLERANCE = 12;

type Rect = { x: number; y: number; w: number; h: number };

/** Section size grown to fit its cards' measured heights, so content never spills out. */
export function fitSection(board: Board, s: Section, heights: Map<string, number>): { w: number; h: number } {
  let w = s.w;
  let h = s.h;
  for (const c of board.cards) {
    if (c.sectionId !== s.id) continue;
    w = Math.max(w, c.x + c.w - s.x + 20);
    h = Math.max(h, c.y + (heights.get(c.id) ?? 0) - s.y + 20);
  }
  return { w, h };
}

/**
 * Final section boxes: each fitted to its cards, and sections in one row (tops within
 * {@link ROW_TOLERANCE}) share the tallest height, as in the design.
 */
export function sectionRects(board: Board, heights: Map<string, number>): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const s of board.sections) out.set(s.id, { x: s.x, y: s.y, ...fitSection(board, s, heights) });
  for (const s of board.sections) {
    const row = board.sections.filter((o) => Math.abs(o.y - s.y) <= ROW_TOLERANCE);
    const h = Math.max(...row.map((o) => out.get(o.id)!.y + out.get(o.id)!.h)) - s.y;
    out.get(s.id)!.h = h;
  }
  return out;
}

/**
 * How far each section must move down so a grown section never runs into one that was below it.
 * "Below" means the section's top was under the other section's stored bottom before growing,
 * so neighbours in the same row are never pushed. Pushes cascade top to bottom.
 */
export function sectionPushes(board: Board, heights: Map<string, number>): Map<string, number> {
  const rects = sectionRects(board, heights);
  const list = board.sections.map((s) => ({ id: s.id, storedBottom: s.y + s.h, ...rects.get(s.id)! })).sort((a, b) => a.y - b.y);
  const out = new Map<string, number>();
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const wasBelow = b.y - (out.get(b.id) ?? 0) >= a.storedBottom - ROW_TOLERANCE;
      if (!overlapX || !wasBelow) continue;
      const need = a.y + a.h + SECTION_GAP - b.y;
      if (need > 0.5) {
        b.y += need;
        out.set(b.id, (out.get(b.id) ?? 0) + need);
      }
    }
  return out;
}
