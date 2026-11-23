import { describe, expect, it } from 'vitest';
import { buildStory, emptyBoard, mediaPaths, parseBoard, sampleBoards, slugify } from './index';

describe('board schema', () => {
  it('accepts every sample board', () => {
    for (const b of sampleBoards) expect(parseBoard(JSON.parse(JSON.stringify(b))).slug).toBe(b.slug);
  });

  it('fills defaults for a minimal board', () => {
    const b = parseBoard({ format: 1, id: 'x', slug: 'x', title: 'X', createdAt: 1, updatedAt: 1 });
    expect(b.cards).toEqual([]);
    expect(b.visibility).toBe('draft');
  });

  it('rejects an unknown card type', () => {
    const b = { ...emptyBoard('X'), cards: [{ id: 'c', type: 'nope', x: 0, y: 0, createdAt: 1, updatedAt: 1 }] };
    expect(() => parseBoard(b)).toThrow();
  });
});

describe('buildStory', () => {
  const [shazam] = sampleBoards;

  it('numbers figures in trail order and leaves out private cards', () => {
    const board = { ...shazam, cards: shazam.cards.map((c) => (c.id === 'c2' ? { ...c, private: true } : c)) };
    const story = buildStory(board);
    const figures = story.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'figure');
    expect(figures.map((f) => f.kind === 'figure' && f.figure)).toEqual([1, 2]);
    expect(story.sections.flatMap((s) => s.blocks).some((b) => b.card.id === 'c2')).toBe(false);
  });

  it('dedupes footnotes by source', () => {
    const story = buildStory(shazam);
    const urls = story.footnotes.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('follows the trail order', () => {
    const story = buildStory({ ...shazam, trail: ['s4', 's1'] });
    expect(story.sections.map((s) => s.section.id)).toEqual(['s4', 's1', 's2', 's3']);
  });
});

describe('helpers', () => {
  it('slugifies titles', () => expect(slugify('How Shazam works?')).toBe('how-shazam-works'));
  it('lists local media only', () => expect(mediaPaths(sampleBoards[0])).toContain('media/clip-01.mp3'));
});
