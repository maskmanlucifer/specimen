import { emptyBoard, parseBoard, sampleBoards, slugify, uid, type Board, type BoardSummary, type BoardThumb } from '@specimen/schema';
import type { StorageRegistry } from './storage/registry';
import { dec, enc, join, safePath, type StorageAdapter } from './storage/types';

/** Raised when a save is based on an older revision than the stored one. Carries the newer board. */
export class ConflictError extends Error {
  readonly status = 409;
  constructor(readonly current: Board) {
    super('Board changed on another device');
  }
}

const notFound = (what: string) => Object.assign(new Error(`${what} not found`), { status: 404 });

/** Card/section boxes scaled into the dashboard thumbnail. */
export function thumbOf(b: Board): BoardThumb {
  const boxes = [...b.sections, ...b.cards.map((c) => ({ ...c, h: c.h ?? 90 }))];
  const w = Math.max(400, ...boxes.map((x) => x.x + x.w));
  const h = Math.max(300, ...boxes.map((x) => x.y + x.h));
  return { w, h, sections: b.sections.map(({ x, y, w, h }) => ({ x, y, w, h })), cards: b.cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h ?? 90, type: c.type })) };
}

function summary(storageId: string, b: Board): BoardSummary {
  return { storageId, slug: b.slug, title: b.title, cards: b.cards.length, visibility: b.visibility, updatedAt: b.updatedAt, publishedUrl: b.publish?.url, thumb: thumbOf(b) };
}

/** Board folders in user storage. Every read is validated; every write bumps `rev`. */
export class Boards {
  constructor(private readonly storages: StorageRegistry) {}

  private adapter(storageId: string): Promise<StorageAdapter> {
    return this.storages.adapter(storageId);
  }

  /** Lists boards in every storage. A storage that fails is reported, not fatal. */
  async list(): Promise<{ boards: BoardSummary[]; errors: { storageId: string; message: string }[] }> {
    const boards: BoardSummary[] = [];
    const errors: { storageId: string; message: string }[] = [];
    await Promise.all(
      (await this.storages.all()).map(async (st) => {
        try {
          const a = await this.adapter(st.id);
          const dirs = (await a.list('')).filter((e) => e.isDir && e.name !== 'plugins');
          await Promise.all(
            dirs.map(async (d) => {
              const raw = await a.read(join(d.name, 'board.json'));
              if (!raw) return;
              try {
                boards.push(summary(st.id, parseBoard(JSON.parse(dec.decode(raw)))));
              } catch {
                /* Not a Specimen board, or a damaged file: skip it rather than break the dashboard. */
              }
            }),
          );
        } catch (e) {
          errors.push({ storageId: st.id, message: (e as Error).message });
        }
      }),
    );
    boards.sort((a, b) => b.updatedAt - a.updatedAt);
    return { boards, errors };
  }

  async get(storageId: string, slug: string): Promise<Board> {
    const raw = await (await this.adapter(storageId)).read(join(safePath(slug), 'board.json'));
    if (!raw) throw notFound('Board');
    return parseBoard(JSON.parse(dec.decode(raw)));
  }

  private async write(a: StorageAdapter, b: Board) {
    await a.write(join(b.slug, 'board.json'), enc.encode(JSON.stringify(b, null, 2)), 'application/json');
  }

  /** Picks a free folder name: `my-topic`, `my-topic-2`, … */
  private async freeSlug(a: StorageAdapter, base: string): Promise<string> {
    const taken = new Set((await a.list('')).map((e) => e.name));
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    return slug;
  }

  /**
   * Creates a board. `template` is the slug of a sample board, whose sections and cards are copied.
   */
  async create(storageId: string, title: string, author?: string, template?: string): Promise<Board> {
    const a = await this.adapter(storageId);
    const b = emptyBoard(title, author);
    b.slug = await this.freeSlug(a, slugify(title));
    const sample = sampleBoards.find((s) => s.slug === template);
    if (sample) Object.assign(b, { sections: sample.sections, cards: sample.cards, links: sample.links, trail: sample.trail, plugins: sample.plugins, dek: sample.dek, log: sample.log });
    b.log = [...b.log, { id: uid('e_'), at: Date.now(), action: 'added', text: `Created board “${title}”` }];
    await this.write(a, b);
    return b;
  }

  /**
   * Saves a board if `baseRev` matches the stored revision.
   *
   * @throws {@link ConflictError} when another device saved first.
   */
  async save(storageId: string, slug: string, next: Board, baseRev: number, force = false): Promise<Board> {
    const a = await this.adapter(storageId);
    const current = await this.get(storageId, slug).catch(() => null);
    if (current && current.rev !== baseRev && !force) throw new ConflictError(current);
    const board = parseBoard({ ...next, slug, rev: (current?.rev ?? baseRev) + 1, updatedAt: Date.now() });
    await this.write(a, board);
    return board;
  }

  async readMedia(storageId: string, slug: string, file: string) {
    return (await this.adapter(storageId)).read(join(safePath(slug), safePath(file)));
  }

  /** Stores a media file under `media/`, renaming on collision. Returns the board-relative path. */
  async putMedia(storageId: string, slug: string, name: string, data: Uint8Array, contentType?: string): Promise<string> {
    const a = await this.adapter(storageId);
    const clean = name.replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '') || 'file';
    const existing = new Set((await a.list(join(slug, 'media'))).map((e) => e.name));
    let file = clean;
    for (let i = 2; existing.has(file); i++) file = clean.replace(/(\.[^.]*)?$/, `-${i}$1`);
    await a.write(join(safePath(slug), 'media', file), data, contentType);
    return `media/${file}`;
  }

  /** Every file in a board folder with its size (for the publish file list and the export). */
  async files(storageId: string, slug: string): Promise<{ path: string; size: number }[]> {
    const a = await this.adapter(storageId);
    const out: { path: string; size: number }[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const e of await a.list(join(slug, dir))) {
        if (e.isDir) await walk(join(dir, e.name));
        else out.push({ path: join(dir, e.name), size: e.size });
      }
    };
    await walk('');
    return out;
  }

  /** Copies a board folder to another storage, then removes the original. */
  async move(fromId: string, slug: string, toId: string): Promise<Board> {
    const from = await this.adapter(fromId);
    const to = await this.adapter(toId);
    const newSlug = await this.freeSlug(to, slug);
    for (const f of await this.files(fromId, slug)) {
      const data = await from.read(join(slug, f.path));
      if (data) await to.write(join(newSlug, f.path), data);
    }
    const b = await this.get(toId, newSlug);
    if (newSlug !== slug) await this.write(to, { ...b, slug: newSlug });
    await from.remove(slug);
    return { ...b, slug: newSlug };
  }
}
