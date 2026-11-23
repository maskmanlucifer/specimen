import { z } from 'zod';

/**
 * The on-disk board format. A board is a folder in the user's storage:
 *
 * ```
 * /Specimen/<slug>/board.json   ← this schema
 * /Specimen/<slug>/media/…       ← files referenced by `src` fields
 * /Specimen/<slug>/plugins/…     ← pinned plugin versions
 * /Specimen/<slug>/published/…   ← static copies
 * ```
 *
 * The format is plain JSON on purpose: any tool can read it without Specimen.
 * Bump {@link BOARD_FORMAT_VERSION} and add a migration in `migrate.ts` for breaking changes.
 */
export const BOARD_FORMAT_VERSION = 1;

/** Unix epoch milliseconds. */
const Timestamp = z.number().int().nonnegative();

/** Where a claim or item came from. Becomes a footnote in the published story. */
export const SourceRef = z.object({
  url: z.string().optional(),
  label: z.string().optional(),
  /** Page or timestamp inside the source, e.g. `"p. 2"`. */
  locator: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

const CardBase = z.object({
  id: z.string(),
  sectionId: z.string().nullable().default(null),
  x: z.number(),
  y: z.number(),
  w: z.number().default(240),
  /** Height is measured from content when absent. */
  h: z.number().optional(),
  tags: z.array(z.string()).default([]),
  source: SourceRef.optional(),
  /** Private cards never leave the editor: they are left out of every published copy. */
  private: z.boolean().default(false),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

export const NoteCard = CardBase.extend({ type: z.literal('note'), text: z.string() });
export const FactCard = CardBase.extend({
  type: z.literal('fact'),
  text: z.string(),
  verified: z.boolean().default(false),
});
export const QuestionCard = CardBase.extend({ type: z.literal('question'), text: z.string() });
export const QuoteCard = CardBase.extend({
  type: z.literal('quote'),
  text: z.string(),
  cite: z.string().optional(),
});
export const LinkCard = CardBase.extend({
  type: z.literal('link'),
  url: z.string(),
  title: z.string().optional(),
  site: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
});
export const ImageCard = CardBase.extend({
  type: z.literal('image'),
  /** Path relative to the board folder (`media/x.png`) or an absolute URL. */
  src: z.string(),
  caption: z.string().optional(),
  alt: z.string().optional(),
});

export const AudioMarker = z.object({ id: z.string(), t: z.number(), label: z.string() });
export type AudioMarker = z.infer<typeof AudioMarker>;
export const TranscriptLine = z.object({ t: z.number(), text: z.string() });
export type TranscriptLine = z.infer<typeof TranscriptLine>;

export const AudioCard = CardBase.extend({
  type: z.literal('audio'),
  src: z.string(),
  title: z.string(),
  duration: z.number().optional(),
  size: z.number().optional(),
  /** Normalised peaks (0–1) so the canvas can draw a waveform without decoding the file. */
  peaks: z.array(z.number()).optional(),
  markers: z.array(AudioMarker).default([]),
  loop: z.object({ start: z.number(), end: z.number() }).optional(),
  transcript: z.array(TranscriptLine).default([]),
});
export const VideoCard = CardBase.extend({
  type: z.literal('video'),
  /** Media path, or a YouTube/Vimeo URL. */
  src: z.string(),
  title: z.string(),
  duration: z.number().optional(),
  size: z.number().optional(),
  poster: z.string().optional(),
});
export const DocumentCard = CardBase.extend({
  type: z.literal('document'),
  src: z.string(),
  title: z.string(),
  pages: z.number().optional(),
  size: z.number().optional(),
});
export const CodeCard = CardBase.extend({
  type: z.literal('code'),
  lang: z.string().default('text'),
  code: z.string(),
  /** 1-based line numbers to highlight. */
  highlight: z.array(z.number()).default([]),
});
export const MathCard = CardBase.extend({ type: z.literal('math'), tex: z.string() });
export const FigureCard = CardBase.extend({
  type: z.literal('figure'),
  /** Plugin id, e.g. `spectrogram-viewer`. The version is pinned in {@link Board.plugins}. */
  plugin: z.string(),
  title: z.string().optional(),
  caption: z.string().optional(),
  settings: z.record(z.unknown()).default({}),
  /** Maps a plugin input key to the id of the card that feeds it. */
  inputs: z.record(z.string()).default({}),
  /** Still image for print and no-JS readers, relative to the board folder. */
  still: z.string().optional(),
});

/** The twelve built-in card types. Everything else is a plugin rendered by a `figure` card. */
export const Card = z.discriminatedUnion('type', [
  NoteCard,
  FactCard,
  QuestionCard,
  QuoteCard,
  LinkCard,
  ImageCard,
  AudioCard,
  VideoCard,
  DocumentCard,
  CodeCard,
  MathCard,
  FigureCard,
]);
export type Card = z.infer<typeof Card>;
export type CardType = Card['type'];
/** @typeParam T - A card `type` literal. */
export type CardOf<T extends CardType> = Extract<Card, { type: T }>;
export const CARD_TYPES = Card.options.map((o) => o.shape.type.value) as CardType[];

export const Section = z.object({
  id: z.string(),
  title: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  /** Lead paragraph shown under the section heading in the story. */
  intro: z.string().optional(),
});
export type Section = z.infer<typeof Section>;

/** A labelled connection between two cards (or sections), e.g. "input", "feeds", "source". */
export const Link = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});
export type Link = z.infer<typeof Link>;

export const Visibility = z.enum(['draft', 'published', 'unlisted']);
export type Visibility = z.infer<typeof Visibility>;

export const LogAction = z.enum(['added', 'edited', 'moved', 'deleted', 'linked', 'published', 'uploaded', 'recorded']);
export type LogAction = z.infer<typeof LogAction>;

/** One entry in the research log. The Log view groups these by day. */
export const LogEvent = z.object({
  id: z.string(),
  at: Timestamp,
  action: LogAction,
  cardId: z.string().optional(),
  cardType: z.string().optional(),
  sectionId: z.string().optional(),
  text: z.string(),
});
export type LogEvent = z.infer<typeof LogEvent>;

export const PublishRecord = z.object({
  target: z.string(),
  url: z.string(),
  at: Timestamp,
  /** Ids of cards that were public at publish time. */
  cards: z.number().optional(),
});
export type PublishRecord = z.infer<typeof PublishRecord>;

export const Board = z.object({
  format: z.literal(BOARD_FORMAT_VERSION),
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  /** Short dek shown under the title in the story. */
  dek: z.string().optional(),
  author: z.string().optional(),
  visibility: Visibility.default('draft'),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  /** Monotonic revision. The server rejects writes based on an older revision (sync conflict). */
  rev: z.number().int().nonnegative().default(0),
  sections: z.array(Section).default([]),
  cards: z.array(Card).default([]),
  links: z.array(Link).default([]),
  /** Reading order of sections in the published story. Sections not listed are appended in canvas order. */
  trail: z.array(z.string()).default([]),
  /** Pinned plugin versions, so plugin updates never change a published figure. */
  plugins: z.record(z.string()).default({}),
  log: z.array(LogEvent).default([]),
  publish: PublishRecord.optional(),
  /** Media file paths to leave out of the published copy (e.g. large videos). */
  excludeMedia: z.array(z.string()).default([]),
  cover: z.string().optional(),
});
export type Board = z.infer<typeof Board>;

/** Parses and validates untrusted board JSON (from storage or an import). */
export function parseBoard(json: unknown): Board {
  return Board.parse(json);
}
