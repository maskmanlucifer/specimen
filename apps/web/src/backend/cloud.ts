import { createClient, type Session as SbSession, type SupabaseClient } from '@supabase/supabase-js';
import { ReconnectError } from './files';

/**
 * "Bring your own Supabase": each person runs Specimen against their own Supabase project.
 * The URL and the public (anon) key are not secret; Supabase designs them for browsers.
 * A deployment can set them at build time; anyone can also paste their own in Settings.
 */
export interface CloudConfig {
  url: string;
  anonKey: string;
  /** Google API key, used only by readers of public share links. Optional. */
  apiKey?: string;
}

const KEY = 'specimen-cloud';
/** Shown when the user signed in but did not allow Drive access on Google's screen. */
export const NO_DRIVE = 'Specimen did not get access to Google Drive. Sign in again and tick the Google Drive box on Google’s screen.';
/** sessionStorage key for a sign-in problem to show after the page reloads. */
export const AUTH_ERROR = 'specimen-auth-error';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** The config pasted in Settings, else the one built into this deployment, else none. */
export function cloudConfig(): CloudConfig | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CloudConfig | null;
    if (saved?.url && saved.anonKey) return saved;
  } catch {
    /* Blocked or damaged storage: fall back to the built-in config. */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey, apiKey: import.meta.env.VITE_GOOGLE_API_KEY as string | undefined } : null;
}

export function saveCloudConfig(cfg: CloudConfig | null) {
  if (cfg) localStorage.setItem(KEY, JSON.stringify(cfg));
  else localStorage.removeItem(KEY);
  client = null;
}

let client: SupabaseClient | null = null;

/** The Supabase client for the current config, or `null` when the user has none. */
export function supabase(): SupabaseClient | null {
  const cfg = cloudConfig();
  if (!cfg) return null;
  // PKCE returns `?code=` in the query, so it never clashes with the app's `#/` routes.
  client ??= createClient(cfg.url, cfg.anonKey, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
  return client;
}

/** Where Google sends the user back: the app's own page, without its `#/route`. */
const returnUrl = () => `${location.origin}${location.pathname}`;

/** Starts "Continue with Google". The page leaves for Google and comes back signed in. */
export async function signInWithGoogle(next = '#/boards') {
  const sb = supabase();
  if (!sb) throw new Error('Add your Supabase project in Settings first');
  sessionStorage.setItem('specimen-next', next);
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: returnUrl(), scopes: DRIVE_SCOPE, queryParams: { access_type: 'offline', prompt: 'consent' } },
  });
  if (error) throw error;
}

let token: { value: string; until: number } | null = null;

/**
 * Calls the `drive-token` Edge Function, which keeps the Google refresh token on the server side.
 *
 * @throws {@link ReconnectError} when Google access is gone.
 */
async function tokenCall(body: Record<string, unknown>) {
  const sb = supabase();
  if (!sb) throw new ReconnectError('Not signed in');
  const { data, error } = await sb.functions.invoke<{ access_token?: string; expires_in?: number; scope?: string; error?: string }>('drive-token', { body });
  if (error || !data?.access_token) throw new ReconnectError('Google Drive access expired. Sign in with Google again.');
  // Google shows Drive access as a checkbox that starts unticked; without it no Drive call works.
  if (data.scope && !data.scope.includes(DRIVE_SCOPE)) throw new ReconnectError(NO_DRIVE);
  token = { value: data.access_token, until: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000 };
  return token.value;
}

/**
 * The current session. On the first load after Google sign-in, hands the Google refresh token
 * to the Edge Function once (Supabase shows it to the browser only at that moment).
 */
export async function cloudSession(): Promise<SbSession | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const s = data.session;
  if (s?.provider_refresh_token && localStorage.getItem('specimen-rt') !== s.user.id + s.provider_refresh_token.slice(-6)) {
    try {
      await tokenCall({ refresh_token: s.provider_refresh_token });
    } catch (e) {
      // A sign-in without Drive access is no use: undo it and explain why on the next screen.
      sessionStorage.setItem(AUTH_ERROR, (e as Error).message);
      await disconnectGoogle();
      return null;
    }
    localStorage.setItem('specimen-rt', s.user.id + s.provider_refresh_token.slice(-6));
    if (s.provider_token) token = { value: s.provider_token, until: Date.now() + 50 * 60 * 1000 };
  }
  return s;
}

/** A valid Google Drive access token, renewed through the Edge Function when it runs out. */
export async function driveToken(force = false): Promise<string> {
  if (!force && token && Date.now() < token.until) return token.value;
  return tokenCall({});
}

export async function signOut() {
  token = null;
  localStorage.removeItem('specimen-rt');
  await supabase()?.auth.signOut();
}

/** Revokes Google access, deletes the stored refresh token, then signs out. Drive files stay. */
export async function disconnectGoogle() {
  await supabase()?.functions.invoke('drive-token', { body: { action: 'disconnect' } }).catch(() => undefined);
  await signOut();
}
