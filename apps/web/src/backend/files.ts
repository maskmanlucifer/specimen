/**
 * A place boards live: this browser (IndexedDB) or the user's Google Drive.
 * Paths are POSIX-style and relative to the storage root, e.g. `how-shazam-works/board.json`.
 * Adapters create missing parent folders on write.
 */
export interface StorageAdapter {
  /** Direct children of a folder. Returns `[]` for a missing folder. */
  list(dir: string): Promise<Entry[]>;
  /** File bytes, or `null` when the file does not exist. */
  read(file: string): Promise<Uint8Array | null>;
  write(file: string, data: Uint8Array | Blob, contentType?: string): Promise<void>;
  /** Removes a file, or a folder and everything in it. Missing paths are not an error. */
  remove(target: string): Promise<void>;
  usage?(): Promise<{ used: number; total?: number }>;
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

/**
 * Rejects `..` so a board slug or media name can never escape the storage root.
 *
 * @throws {Error} with `status: 400` for a path that climbs out.
 */
export function safePath(p: string): string {
  const clean = join(p);
  if (clean.split('/').some((s) => s === '..')) throw Object.assign(new Error(`Invalid path: ${p}`), { status: 400 });
  return clean;
}

const MIME: Record<string, string> = {
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
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
};

/** Content type from a file name. */
export function mimeOf(file: string): string {
  return MIME[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/** Raised when Google access is gone and the user must sign in again. */
export class ReconnectError extends Error {
  readonly reconnect = true;
}
