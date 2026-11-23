import { describe, expect, it } from 'vitest';
import { emptyBoard, type Board, type Card } from '@specimen/schema';
import { fitSection, sectionPushes, sectionRects } from './layout';

const note = (id: string, sectionId: string, x: number, y: number): Card => ({ id, sectionId, type: 'note', text: '', x, y, w: 200, tags: [], private: false, createdAt: 0, updatedAt: 0 });

function board(): Board {
  const b = emptyBoard('t');
  b.sections = [
    { id: 'top', title: 'Top', x: 0, y: 0, w: 400, h: 200 },
    { id: 'below', title: 'Below', x: 0, y: 220, w: 400, h: 200 },
    { id: 'side', title: 'Side', x: 500, y: 220, w: 300, h: 200 },
  ];
  b.cards = [note('a', 'top', 20, 40)];
  return b;
}

describe('section layout', () => {
  it('grows a section to fit its measured cards', () => {
    expect(fitSection(board(), board().sections[0], new Map([['a', 300]])).h).toBe(360);
  });

  it('keeps the gap by pushing only sections underneath', () => {
    const shifts = sectionPushes(board(), new Map([['a', 300]]));
    expect(shifts.get('below')).toBe(160); // 0 + 360 + 20 gap − 220
    expect(shifts.has('side')).toBe(false); // not under the grown section
  });

  it('does nothing when everything fits', () => {
    expect(sectionPushes(board(), new Map([['a', 100]])).size).toBe(0);
  });
});

describe('rows and neighbours', () => {
  it('gives sections in one row the same height', () => {
    const b = board();
    b.sections[2].y = 225; // same row as "below"
    b.cards.push(note('s', 'side', 520, 260));
    const r = sectionRects(b, new Map([['s', 400]]));
    expect(r.get('below')!.h).toBe(r.get('side')!.h + 5);
  });

  it('never pushes a neighbour that only sits a little lower in the same row', () => {
    const b = board();
    b.sections[2] = { ...b.sections[2], y: 40, x: 380 }; // overlaps "top" horizontally after growth
    expect(sectionPushes(b, new Map([['a', 300]])).has('side')).toBe(false);
  });
});
