import { signInWithGoogle } from '../backend/cloud';
import { backend, ConflictError, ReconnectError } from '../backend';

/** An API error with a status and a body (e.g. the newer board on a 409), as the UI expects. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  /** True for a dropped connection: the UI switches to "Offline" and queues the change. */
  get offline() {
    return this.status === 0;
  }
  get reconnect() {
    return this.body.reconnect === true;
  }
}

/** Turns back-end errors into {@link ApiError}s: conflict 409, reconnect 401, network 0. */
function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof ConflictError) return new ApiError(409, e.message, { current: e.current });
  if (e instanceof ReconnectError) return new ApiError(401, e.message, { reconnect: true });
  // A failed fetch (no network) is a TypeError in every browser.
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) return new ApiError(0, 'You are offline');
  const err = e as Error & { status?: number };
  return new ApiError(err.status ?? 500, err.message ?? String(e));
}

type Fn = (...args: never[]) => Promise<unknown>;
type Wrapped<T> = { [K in keyof T]: T[K] extends Fn ? (...a: Parameters<T[K]>) => ReturnType<T[K]> : T[K] };

/** Wraps every async back-end function so callers only ever see {@link ApiError}. */
function wrap<T extends Record<string, unknown>>(o: T): Wrapped<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'function' ? (...a: unknown[]) => Promise.resolve().then(() => (v as (...x: unknown[]) => unknown).apply(o, a)).catch((e) => Promise.reject(toApiError(e))) : v;
  return out as Wrapped<T>;
}

/**
 * The app's data API. It runs fully in the browser: boards live in IndexedDB ("This browser")
 * or in the user's Google Drive, reached through their own Supabase project.
 */
export const api = wrap({ ...backend, signInWithGoogle });
