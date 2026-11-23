import { describe, expect, it } from 'vitest';
import { classifyText, fileKind } from './capture';

describe('classifyText (what pasted text becomes)', () => {
  it.each([
    ['https://en.wikipedia.org/wiki/Huffman_coding', 'link'],
    ['https://youtu.be/dQw4w9WgXcQ', 'video'],
    ['$E = mc^2$', 'math'],
    ['```python\nprint(1)\n```', 'code'],
    ['SELECT id FROM t;', 'code'],
    ['for x in y:\n    total += x\nreturn total', 'code'],
    ['“The map is not the territory.” — Korzybski', 'quote'],
    ['Why can’t you compress a file twice?', 'question'],
    ['English text is full of repetition.', 'note'],
  ])('%s → %s', (text, type) => expect(classifyText(text).type).toBe(type));

  it('keeps the fenced language', () => {
    const c = classifyText('```rust\nfn main() {}\n```');
    expect(c.type === 'code' && c.lang).toBe('rust');
  });
});

describe('fileKind', () => {
  const f = (name: string, type = '') => new File(['x'], name, { type });
  it.each([
    [f('a.png', 'image/png'), 'image'],
    [f('clip.mp3'), 'audio'],
    [f('take.mov'), 'video'],
    [f('paper.pdf'), 'document'],
    [f('notes.md'), 'note'],
    [f('archive.bin'), null],
  ])('%#', (file, kind) => expect(fileKind(file)).toBe(kind));
});
