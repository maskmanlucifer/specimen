import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let key: Buffer | null = null;

/**
 * Loads the instance key from `SECRET`, or from `<dataDir>/secret.key` (created on first run).
 * Losing this key means stored storage credentials must be entered again; boards are not affected.
 */
export function initKey(dataDir: string, envSecret = process.env.SECRET) {
  if (envSecret) {
    key = crypto.createHash('sha256').update(envSecret).digest();
    return;
  }
  const file = path.join(dataDir, 'secret.key');
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  key = Buffer.from(fs.readFileSync(file, 'utf8'), 'base64');
}

/** Encrypts a JSON value with AES-256-GCM. Output: `iv.tag.ciphertext` in base64url. */
export function seal(value: unknown): string {
  if (!key) throw new Error('crypto key not initialised');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

/**
 * Decrypts a value from {@link seal}.
 *
 * @typeParam T - Expected shape of the sealed JSON.
 * @throws If the key changed or the value was tampered with.
 */
export function open<T>(sealed: string): T {
  if (!key) throw new Error('crypto key not initialised');
  const [iv, tag, body] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(body), d.final()]).toString('utf8')) as T;
}

/** Random URL-safe token for sessions and magic links. */
export function token(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Constant-time string compare for passwords. */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
