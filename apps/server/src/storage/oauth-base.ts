import { ReconnectError } from '../oauth';
import { httpError } from './types';

/** Returns a valid access token, refreshing it when needed. Throws {@link ReconnectError} when it cannot. */
export type TokenSource = () => Promise<string>;

/**
 * `fetch` with a bearer token. A 401 means the user revoked access in their provider account:
 * that surfaces as "Reconnect needed" rather than a generic error.
 */
export async function authed(token: TokenSource, url: string, init: RequestInit = {}, what = 'request'): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${await token()}`, ...init.headers } });
  if (res.status === 401) throw new ReconnectError(`${what}: access was removed or expired`);
  return res;
}

/** Same as {@link authed} but throws on any non-2xx status except the allowed ones. */
export async function authedOk(token: TokenSource, url: string, init: RequestInit = {}, what = 'request', allow: number[] = []): Promise<Response> {
  const res = await authed(token, url, init, what);
  if (!res.ok && !allow.includes(res.status)) throw await httpError(res, what);
  return res;
}
