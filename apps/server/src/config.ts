import path from 'node:path';
import type { AuthMode } from '@specimen/schema';

/**
 * Instance configuration from environment variables. Every variable is optional:
 * with none set, Specimen runs on http://localhost:3000, single user, no login,
 * and keeps boards in `./.data/boards`.
 */
export interface Config {
  port: number;
  /** Public origin used for OAuth redirects and email links. */
  publicUrl: string;
  /** Holds `instance.json` (accounts, connections) and the default local storage. */
  dataDir: string;
  auth: AuthMode;
  /** Required when `auth` is `password`. */
  password?: string;
  /** Folder with built-in plugins. */
  pluginsDir: string;
  /** Built web client, served in production. */
  webDist: string;
  /** Built static reader bundle (`packages/story/dist`), copied into every published board. */
  readerDist: string;
  oauth: {
    google?: { id: string; secret: string };
    github?: { id: string; secret: string };
    dropbox?: { id: string; secret: string };
    onedrive?: { id: string; secret: string };
  };
  /** `smtp://user:pass@host:587`. Without it, magic links are printed to the server log. */
  smtpUrl?: string;
  mailFrom: string;
  version: string;
}

const root = path.resolve(import.meta.dirname, '../../..');

function pair(prefix: string) {
  const id = process.env[`${prefix}_CLIENT_ID`];
  const secret = process.env[`${prefix}_CLIENT_SECRET`];
  return id && secret ? { id, secret } : undefined;
}

/** Reads the config once at boot. Exits with a clear message on an invalid combination. */
export function loadConfig(env = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  const auth = (env.AUTH ?? 'none') as AuthMode;
  if (!['none', 'password', 'hosted'].includes(auth)) throw new Error(`AUTH must be none, password or hosted (got "${auth}")`);
  if (auth === 'password' && !env.PASSWORD) throw new Error('AUTH=password needs PASSWORD to be set');
  return {
    port,
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, '.data')),
    auth,
    password: env.PASSWORD,
    pluginsDir: path.join(root, 'plugins'),
    webDist: path.join(root, 'apps/web/dist'),
    readerDist: path.join(root, 'packages/story/dist'),
    oauth: { google: pair('GOOGLE'), github: pair('GITHUB'), dropbox: pair('DROPBOX'), onedrive: pair('ONEDRIVE') },
    smtpUrl: env.SMTP_URL,
    mailFrom: env.MAIL_FROM ?? 'Specimen <no-reply@localhost>',
    version: '1.8.2',
  };
}
