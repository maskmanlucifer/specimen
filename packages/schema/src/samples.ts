import type { z } from 'zod';
import { BOARD_FORMAT_VERSION, Card, type Board, type Link, type Section } from './board';

/**
 * Example boards from the design. Used to seed a new instance ("Start with an example"),
 * by tests, and by the landing page demo. Media paths point at files that may not exist;
 * cards render a placeholder when a file is missing.
 */
type CardInput = z.input<typeof Card>;
type Draft = CardInput extends infer C ? (C extends unknown ? Omit<C, 'createdAt' | 'updatedAt'> : never) : never;

const T0 = Date.UTC(2026, 10, 14, 9, 41);

function build(meta: Pick<Board, 'id' | 'slug' | 'title' | 'dek' | 'author' | 'visibility'>, sections: Section[], drafts: (Draft & { sectionId: string })[], links: Link[], plugins: Record<string, string>): Board {
  const cards = drafts.map((d, i) => Card.parse({ createdAt: T0 + i * 3_600_000, updatedAt: T0 + i * 3_600_000, ...d }));
  return {
    format: BOARD_FORMAT_VERSION,
    ...meta,
    createdAt: T0,
    updatedAt: T0 + drafts.length * 3_600_000,
    rev: 1,
    sections,
    cards,
    links,
    trail: sections.map((s) => s.id),
    plugins,
    log: cards.map((c, i) => ({ id: `e${i}`, at: c.createdAt, action: 'added' as const, cardId: c.id, cardType: c.type, sectionId: c.sectionId ?? undefined, text: `Added ${c.type} card` })),
    excludeMedia: [],
  };
}

const peaks = (seed: number, n = 96) =>
  Array.from({ length: n }, (_, i) => Math.round((0.25 + 0.75 * Math.abs(Math.sin(i * 0.37 + seed) * Math.cos(i * 0.11 + seed * 2))) * 100) / 100);

export const shazam: Board = build(
  { id: 'b_shazam', slug: 'how-shazam-works', title: 'How Shazam works', dek: 'Ten seconds of a noisy café, and a phone names the song. The trick is a fingerprint made of spectrogram peaks.', author: 'A. Rivera', visibility: 'draft' },
  [
    { id: 's1', title: 'Capture', x: 0, y: 0, w: 420, h: 470 },
    { id: 's2', title: 'Spectrogram', x: 440, y: 0, w: 528, h: 470 },
    { id: 's3', title: 'Fingerprints', x: 988, y: 0, w: 404, h: 470 },
    { id: 's4', title: 'Matching', x: 0, y: 490, w: 1392, h: 400 },
  ],
  [
    { id: 'c1', sectionId: 's1', type: 'audio', x: 20, y: 40, w: 380, src: 'media/clip-01.mp3', title: 'clip-01.mp3 — café, 10 s', duration: 10, size: 412_000, peaks: peaks(1), markers: [{ id: 'm1', t: 2.1, label: 'Voice: “oat flat white?”' }, { id: 'm2', t: 4, label: 'Chorus enters' }, { id: 'm3', t: 7.5, label: 'Espresso machine (noise)' }], transcript: [{ t: 0, text: '[café noise]' }, { t: 2.1, text: '“Can I get an oat flat white?”' }, { t: 4, text: '[music, chorus]' }, { t: 7.5, text: '[steam wand]' }], tags: ['field-recording', 'noise', 'input'], source: { label: 'Recorded on my phone · 14 Nov 2026, 09:41' } },
    { id: 'c2', sectionId: 's1', type: 'note', x: 20, y: 180, w: 184, text: 'A phone mic, a loud room, 10 seconds. The fingerprint must survive all three.' },
    { id: 'c3', sectionId: 's1', type: 'fact', x: 216, y: 180, w: 184, verified: true, text: 'Shazam launched in the UK in 2002 as a dial-in number: 2580.', source: { url: 'https://en.wikipedia.org/wiki/Shazam_(application)', label: 'Wikipedia' } },
    { id: 'c4', sectionId: 's1', type: 'question', x: 20, y: 330, w: 184, text: 'Would it still match a live cover at a different tempo?' },
    { id: 'c5', sectionId: 's1', type: 'document', x: 216, y: 330, w: 184, src: 'media/wang-2003.pdf', title: 'Wang (2003): An Industrial-Strength Audio Search Algorithm', pages: 7 },
    { id: 'c6', sectionId: 's2', type: 'figure', x: 460, y: 40, w: 320, plugin: 'spectrogram-viewer', title: 'Spectrogram viewer', caption: 'Peaks in a 10 s café clip. Hover to inspect.', settings: { window: 1024, density: 12, peaks: true }, inputs: { audio: 'c1' } },
    { id: 'c7', sectionId: 's2', type: 'note', x: 792, y: 40, w: 156, text: '1024-pt FFT at 11 kHz ≈ 93 ms per column.' },
    { id: 'c8', sectionId: 's2', type: 'math', x: 792, y: 140, w: 156, tex: 'S(t, f) = |\\mathcal{F}\\{x \\cdot w\\}|^2' },
    { id: 'c9', sectionId: 's2', type: 'fact', x: 460, y: 300, w: 320, verified: false, text: 'Spectrogram peaks survive noise, EQ and phone-mic compression far better than raw samples.', source: { label: 'Wang 2003', locator: 'p. 2', url: 'https://www.ee.columbia.edu/~dpwe/papers/Wang03-shazam.pdf' } },
    { id: 'c10', sectionId: 's2', type: 'image', x: 792, y: 250, w: 156, src: 'media/audacity-spectro.png', caption: 'Same clip in Audacity' },
    { id: 'c11', sectionId: 's3', type: 'audio', x: 1008, y: 40, w: 364, src: 'media/song-ref.wav', title: 'song-ref.wav — reference, 30 s', duration: 30, peaks: peaks(4), markers: [{ id: 'm4', t: 6, label: 'Anchor peak' }, { id: 'm5', t: 14, label: 'Target zone' }] },
    { id: 'c12', sectionId: 's3', type: 'code', x: 1008, y: 180, w: 232, lang: 'python', code: '# one hash per pair\nfor t in target_zone(a):\n    h = (a.f, t.f, t.t - a.t)\n    index[h].append(a.t)', highlight: [3] },
    { id: 'c13', sectionId: 's3', type: 'image', x: 1252, y: 180, w: 120, src: 'media/notebook-sketch.jpg', caption: 'Notebook sketch' },
    { id: 'c14', sectionId: 's3', type: 'note', x: 1008, y: 340, w: 176, text: 'Each anchor pairs with ~5 peaks ahead of it.' },
    { id: 'c15', sectionId: 's3', type: 'fact', x: 1196, y: 340, w: 176, verified: false, text: 'Each pair packs into one 32-bit hash.' },
    { id: 'c16', sectionId: 's4', type: 'figure', x: 20, y: 530, w: 360, plugin: 'step-animator', title: 'Step-through animator', caption: 'hash matching', settings: { preset: 'hash-matching' } },
    { id: 'c17', sectionId: 's4', type: 'note', x: 400, y: 530, w: 200, text: 'Look up every clip hash. Each hit votes for a (song, offset) pair.' },
    { id: 'c18', sectionId: 's4', type: 'image', x: 400, y: 638, w: 200, src: 'media/scatter-matches.png', caption: 'A true match forms a diagonal' },
    { id: 'c19', sectionId: 's4', type: 'math', x: 620, y: 530, w: 184, tex: '\\delta t = t_{song} - t_{clip}' },
    { id: 'c20', sectionId: 's4', type: 'fact', x: 620, y: 618, w: 184, verified: true, text: 'The right song shows one tall spike in the δt histogram.' },
    { id: 'c21', sectionId: 's4', type: 'question', x: 620, y: 726, w: 184, text: 'What if two songs share a sample?' },
    { id: 'c22', sectionId: 's4', type: 'code', x: 824, y: 530, w: 256, lang: 'sql', code: 'SELECT song_id,\n  t_song - t_clip AS dt,\n  count(*) AS votes\nFROM hits GROUP BY 1, 2\nORDER BY votes DESC LIMIT 1;', highlight: [2] },
    { id: 'c23', sectionId: 's4', type: 'link', x: 824, y: 670, w: 256, url: 'https://github.com/dpwe/audfprint', title: 'dpwe/audfprint: landmark-based audio fingerprinting', site: 'github.com' },
    { id: 'c24', sectionId: 's4', type: 'video', x: 1100, y: 530, w: 272, src: 'media/my-test-5-songs.mov', title: 'my-test-5-songs.mov', duration: 102, size: 48_000_000 },
    { id: 'c25', sectionId: 's4', type: 'note', x: 1100, y: 710, w: 272, text: 'Result: the song, and where in it I was, usually in under a second.' },
  ],
  [
    { id: 'l1', from: 'c1', to: 'c6', label: 'input' },
    { id: 'l2', from: 'c5', to: 'c9', label: 'source' },
    { id: 'l3', from: 'c9', to: 'c16', label: 'feeds' },
    { id: 'l4', from: 'c15', to: 'c22', label: 'stored as' },
  ],
  { 'spectrogram-viewer': '1.3.0', 'step-animator': '1.0.0' },
);

export const compression: Board = build(
  { id: 'b_compression', slug: 'how-compression-works', title: 'How compression works', dek: 'Every file is full of repetition. A good compressor notices that the letter A appears seven times, and decides A deserves the shortest name.', author: 'A. Rivera', visibility: 'published' },
  [
    { id: 'k1', title: 'Redundancy', x: 0, y: 0, w: 420, h: 320, intro: 'English text is full of repetition. Compression spends fewer bits on what repeats.' },
    { id: 'k2', title: 'Entropy coding', x: 440, y: 0, w: 560, h: 320, intro: "In ABRACADABRA the letter A appears five times and D only once. Huffman's idea: build a tree from the bottom up, always joining the two rarest symbols. The path to each leaf is its code." },
    { id: 'k3', title: 'Dictionaries', x: 1020, y: 0, w: 420, h: 320, intro: 'Instead of naming symbols, point back at text you have already seen.' },
  ],
  [
    { id: 'd1', sectionId: 'k1', type: 'note', x: 20, y: 40, w: 380, text: 'English text is full of repetition. “the” alone is about 5% of all words. Compression spends fewer bits on what repeats.' },
    { id: 'd2', sectionId: 'k1', type: 'quote', x: 20, y: 140, w: 380, text: 'The fundamental problem of communication is that of reproducing at one point… a message selected at another point.', cite: 'Claude Shannon, 1948' },
    { id: 'd3', sectionId: 'k1', type: 'question', x: 20, y: 240, w: 380, text: "Why can't you compress a file twice?" },
    { id: 'd4', sectionId: 'k2', type: 'figure', x: 460, y: 40, w: 320, plugin: 'tree-builder', title: 'Tree builder', caption: 'B and C are the rarest, so they merge first and end up deepest in the tree.', settings: { input: 'ABRACADABRA' } },
    { id: 'd5', sectionId: 'k2', type: 'math', x: 800, y: 40, w: 180, tex: 'H = -\\sum_i p_i \\log_2 p_i' },
    { id: 'd6', sectionId: 'k2', type: 'fact', x: 800, y: 130, w: 180, verified: true, text: 'Huffman wrote the method as an MIT term paper in 1952.', source: { label: 'Huffman, 1952', locator: 'Proc. IRE 40(9)', url: 'https://ieeexplore.ieee.org/document/4051119' } },
    { id: 'd7', sectionId: 'k3', type: 'code', x: 1040, y: 40, w: 380, lang: 'python', code: 'window = data[i-4096:i]\nd, n = longest(window, i)\nemit(d, n, data[i+n])', source: { label: 'Ziv & Lempel, 1977', url: 'https://ieeexplore.ieee.org/document/1055714' } },
    { id: 'd8', sectionId: 'k3', type: 'note', x: 1040, y: 160, w: 380, text: 'LZ77 replaces a repeat with a (distance, length) pair pointing back into a sliding window.' },
  ],
  [
    { id: 'kl1', from: 'd3', to: 'd5', label: 'see' },
    { id: 'kl2', from: 'd6', to: 'd7', label: 'then' },
  ],
  { 'tree-builder': '1.0.0' },
);

export const sampleBoards: Board[] = [shazam, compression];
