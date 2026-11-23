/**
 * Types shared by the HTTP API (`apps/server`) and its client (`apps/web`).
 * Kept free of runtime code so both sides import only types.
 */
import type { Board, Visibility } from './board';
import type { PluginManifest } from './plugin';

export type AuthMode = 'none' | 'password' | 'hosted';

export type StorageKind = 'local' | 'gdrive' | 'dropbox' | 'onedrive' | 's3' | 'r2' | 'webdav' | 'nextcloud';

/** Two-letter badge shown next to a storage name in the design ("GD", "R2"…). */
export const STORAGE_BADGE: Record<StorageKind, string> = {
  local: 'BR',
  gdrive: 'GD',
  dropbox: 'DB',
  onedrive: 'OD',
  s3: 'S3',
  r2: 'R2',
  webdav: 'WD',
  nextcloud: 'NC',
};

export const STORAGE_NAME: Record<StorageKind, string> = {
  local: 'This browser',
  gdrive: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  s3: 'Amazon S3',
  r2: 'Cloudflare R2',
  webdav: 'WebDAV',
  nextcloud: 'Nextcloud',
};

export type StorageStatus = 'ok' | 'reconnect' | 'disconnected';

export interface StorageInfo {
  id: string;
  kind: StorageKind;
  name: string;
  /** Root folder inside the provider, e.g. `/Specimen`. */
  root: string;
  isDefault: boolean;
  status: StorageStatus;
  usage?: { used: number; total?: number };
  /** Last 4 chars of a secret key, for display only. */
  keyHint?: string;
  /** Account label, e.g. the Google email. */
  account?: string;
}

/** Fields the S3/R2/WebDAV key forms send. Secrets are encrypted at rest on the server. */
export interface StorageCredentials {
  endpoint?: string;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  username?: string;
  password?: string;
  /** Absolute path for the `local` kind. */
  path?: string;
}

export interface StorageTestResult {
  ok: boolean;
  ms: number;
  checks: { read: boolean; write: boolean; list: boolean };
  /** Plain-language error with a fix, e.g. a 403 on PutObject. */
  error?: { title: string; detail: string };
}

export type SyncState = 'saved' | 'saving' | 'offline' | 'reconnect' | 'conflict' | 'error';

/** Boxes for the dashboard thumbnail, in board coordinates, scaled by the client. */
export interface BoardThumb {
  w: number;
  h: number;
  sections: { x: number; y: number; w: number; h: number }[];
  /** `type` lets the dashboard tint each card with its type colour and show the board's mix. */
  cards: { x: number; y: number; w: number; h: number; type: string }[];
}

export interface BoardSummary {
  storageId: string;
  slug: string;
  title: string;
  cards: number;
  visibility: Visibility;
  updatedAt: number;
  publishedUrl?: string;
  thumb: BoardThumb;
}

export interface BoardResponse {
  board: Board;
  storage: StorageInfo;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  email?: string;
  bio?: string;
  /** Linked sign-in methods. */
  methods: { kind: 'google' | 'github' | 'email' | 'password'; label: string }[];
}

export interface Session {
  user: User | null;
  authMode: AuthMode;
  version: string;
  /** OAuth sign-in/connect providers configured on this instance (have client ids). */
  providers: { google: boolean; github: boolean; dropbox: boolean; onedrive: boolean; email: boolean };
  dataDir: string;
  onboarded: boolean;
}

export type HostKind = 'github' | 'netlify' | 'cloudflare' | 'server' | 'folder';

export interface HostInfo {
  id: string;
  kind: HostKind;
  name: string;
  /** Repo, site name, rsync target or folder path. */
  target: string;
  domain?: string;
  connected: boolean;
}

export interface PublishRequest {
  /** `share` publishes share links from the storage; anything else is a host id. */
  via: 'share' | string;
  visibility: Exclude<Visibility, 'draft'>;
  domain?: string;
}

export interface PublishResult {
  url: string;
  files: number;
  bytes: number;
}

export interface PublicFile {
  path: string;
  size: number;
  excluded: boolean;
  /** Referenced by a card but not in storage; the reader shows a placeholder. */
  missing: boolean;
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  builtIn: boolean;
  /** Boards that use the plugin, for "Same plugin, different data". */
  usedIn: { slug: string; title: string; caption?: string }[];
}

export interface ActivityItem {
  at: number;
  what: string;
  board: string;
}

export interface Settings {
  defaultVisibility: Exclude<Visibility, 'draft'>;
  theme: 'system' | 'light' | 'dark';
  reduceMotion: 'system' | 'on' | 'off';
}
