import { describe, expect, it } from 'vitest';
import { Boards, ConflictError } from './boards';
import { dec, join, type Entry, type StorageAdapter } from './files';
import { boardFromMarkdown } from './importer';

/** A storage that keeps files in a Map, with folders implied by paths (like IndexedDB). */
class MemoryStorage implements StorageAdapter {
  files = new Map<string, Uint8Array>();
  async list(dir: string): Promise<Entry[]> {
    const prefix = dir ? `${dir}/` : '';
    const out = new Map<string, Entry>();
    for (const [p, d] of this.files) {
      if (!p.startsWith(prefix)) continue;
      const [name, ...rest] = p.slice(prefix.length).split('/');
      out.set(name, { name, isDir: rest.length > 0 || !!out.get(name)?.isDir, size: rest.length ? 0 : d.byteLength });
    }
    return [...out.values()];
  }
  async read(f: string) {
    return this.files.get(join(f)) ?? null;
  }
  async write(f: string, data: Uint8Array | Blob) {
    this.files.set(join(f), data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data);
  }
  async remove(t: string) {
    for (const k of [...this.files.keys()]) if (k === t || k.startsWith(`${t}/`)) this.files.delete(k);
  }
}

const setup = () => {
  const stores: Record<string, MemoryStorage> = { local: new MemoryStorage(), gdrive: new MemoryStorage() };
  return { stores, boards: new Boards(async (id) => stores[id], async () => Object.keys(stores)) };
};

describe('Boards in the browser', () => {
  it('creates boards with free folder names', async () => {
    const { boards } = setup();
    const a = await boards.create('local', 'Tides');
    const b = await boards.create('local', 'Tides');
    expect([a.slug, b.slug]).toEqual(['tides', 'tides-2']);
    expect((await boards.list()).boards.map((x) => x.slug).sort()).toEqual(['tides', 'tides-2']);
  });

  it('rejects a save based on an old revision, unless forced', async () => {
    const { boards } = setup();
    const b = await boards.create('local', 'Tides');
    const saved = await boards.save('local', b.slug, { ...b, title: 'One' }, b.rev);
    await expect(boards.save('local', b.slug, { ...b, title: 'Two' }, b.rev)).rejects.toBeInstanceOf(ConflictError);
    const forced = await boards.save('local', b.slug, { ...b, title: 'Two' }, b.rev, true);
    expect(forced.rev).toBe(saved.rev + 1);
  });

  it('renames media on a name clash', async () => {
    const { boards } = setup();
    const b = await boards.create('local', 'Tides');
    const one = await boards.putMedia('local', b.slug, 'moon.png', new Uint8Array([1]));
    const two = await boards.putMedia('local', b.slug, 'moon.png', new Uint8Array([2]));
    expect([one, two]).toEqual(['media/moon.png', 'media/moon-2.png']);
  });

  it('moves a board with its media to another storage', async () => {
    const { boards, stores } = setup();
    const b = await boards.create('local', 'Tides');
    await boards.putMedia('local', b.slug, 'moon.png', new Uint8Array([7]));
    const moved = await boards.move('local', b.slug, 'gdrive');
    expect(stores.local.files.size).toBe(0);
    expect(stores.gdrive.files.get(`${moved.slug}/media/moon.png`)).toEqual(new Uint8Array([7]));
    expect(JSON.parse(dec.decode(stores.gdrive.files.get(`${moved.slug}/board.json`)!)).title).toBe('Tides');
  });

  it('never lists the plugins folder as a board', async () => {
    const { boards, stores } = setup();
    await stores.local.write('plugins/x/plugin.json', new Uint8Array([1]));
    expect((await boards.list()).boards).toEqual([]);
  });
});

describe('Markdown import', () => {
  it('turns headings into sections and blocks into cards', () => {
    const b = boardFromMarkdown('# Tides\n\n## Why\n\nThe moon pulls water.\n\nWhy twice a day?\n\n## Links\n\nhttps://example.com', 'x');
    expect(b.title).toBe('Tides');
    expect(b.sections.map((s) => s.title)).toEqual(['Why', 'Links']);
    expect(b.cards.map((c) => c.type)).toEqual(['note', 'question', 'link']);
  });
});
