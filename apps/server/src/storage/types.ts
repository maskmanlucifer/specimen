/**
 * A place boards live. Every provider (local folder, Drive, Dropbox, S3…) implements this.
 * Paths are POSIX-style and relative to the storage root (`/Specimen`), e.g.
 * `how-shazam-works/board.json`. Adapters create missing parent folders on write.
 */
export interface StorageAdapter {
  /** Direct children of a folder. Returns `[]` for a missing folder. */
  list(dir: string): Promise<Entry[]>;
  /** File bytes, or `null` when the file does not exist. */
  read(file: string): Promise<Uint8Array | null>;
  write(file: string, data: Uint8Array, contentType?: string): Promise<void>;
  /** Removes a file, or a folder and everything in it. Missing paths are not an error. */
  remove(target: string): Promise<void>;
  usage?(): Promise<{ used: number; total?: number }>;
  /** A URL anyone with the link can open, for "Share links from your storage". */
  share?(file: string): Promise<string>;
}

export interface Entry {
  name: string;
  isDir: boolean;
  size: number;
  modified?: number;
}

export const enc = new TextEncoder();
export const dec = new TextDecoder();

/** Joins path parts and strips leading, trailing and duplicate slashes. */
export function join(...parts: string[]): string {
  return parts
    .join('/')
    .split('/')
    .filter((p) => p && p !== '.')
    .join('/');
}

/** Rejects `..` so a board slug or media name can never escape the storage root. */
export function safePath(p: string): string {
  const clean = join(p);
  if (clean.split('/').some((s) => s === '..')) throw Object.assign(new Error(`Invalid path: ${p}`), { status: 400 });
  return clean;
}

/** Turns a failed HTTP response into an error with the provider's message. */
export async function httpError(res: Response, what: string): Promise<Error & { status: number }> {
  const body = await res.text().catch(() => '');
  const msg = body.match(/<Code>(.*?)<\/Code>/)?.[1] ?? body.slice(0, 300);
  return Object.assign(new Error(`${what}: ${res.status} ${msg}`), { status: res.status });
}

export const MIME: Record<string, string> = {
  json: 'application/json',
  html: 'text/html; charset=utf-8',
  js: 'text/javascript',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'video/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
};

/** Content type from a file name. */
export function mimeOf(file: string): string {
  return MIME[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/** `fetch` body typing: TS 5.9 rejects `Uint8Array<ArrayBufferLike>`; node accepts any Uint8Array. */
export const toBody = (data: Uint8Array) => data as Uint8Array<ArrayBuffer>;
