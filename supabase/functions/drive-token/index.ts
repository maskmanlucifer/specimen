/**
 * drive-token: gives the signed-in browser a short-lived Google Drive access token.
 *
 * The browser cannot keep a Google refresh token safely, so this function keeps it,
 * encrypted, in `public.google_tokens`, and trades it for access tokens on request.
 *
 * Requests (all need `Authorization: Bearer <Supabase user JWT>`):
 * - `POST {}` returns `{ access_token, expires_in, scope }`.
 * - `POST { refresh_token }` stores the refresh token Google gave at sign-in, then returns a token.
 * - `POST { action: "disconnect" }` revokes the token at Google and deletes the row.
 *
 * Errors: `401 { error: "reconnect" }` means the user must sign in with Google again.
 *
 * Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY (32 random bytes, base64).
 * SUPABASE_URL and the project API keys are set by Supabase.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
};

/**
 * A Supabase API key. New projects expose JSON maps (`SUPABASE_PUBLISHABLE_KEYS`,
 * `SUPABASE_SECRET_KEYS`); older ones the legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
 */
function supabaseKey(kind: 'public' | 'secret'): string {
  const map = Deno.env.get(kind === 'public' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS');
  if (map) {
    try {
      const keys = JSON.parse(map) as Record<string, string>;
      const key = keys.default ?? Object.values(keys)[0];
      if (key) return key;
    } catch {
      /* Not JSON: fall back to the legacy variable. */
    }
  }
  return env(kind === 'public' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY');
}

/** AES-GCM key from the TOKEN_KEY secret. */
const key = () => crypto.subtle.importKey('raw', Uint8Array.from(atob(env('TOKEN_KEY')), (c) => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt', 'decrypt']);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(data)}`;
}

async function open(sealed: string): Promise<string> {
  const [iv, data] = sealed.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(data)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // getUser() needs the JWT passed in: a server client has no stored session to fall back on.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'signed-out' }, 401);
  const asUser = createClient(env('SUPABASE_URL'), supabaseKey('public'));
  const { data: who } = await asUser.auth.getUser(jwt);
  if (!who.user) return json({ error: 'signed-out' }, 401);

  const admin = createClient(env('SUPABASE_URL'), supabaseKey('secret'));
  const body = (await req.json().catch(() => ({}))) as { refresh_token?: string; action?: string };

  if (body.action === 'disconnect') {
    const { data: row } = await admin.from('google_tokens').select('refresh_token').eq('user_id', who.user.id).maybeSingle();
    if (row) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await open(row.refresh_token))}`, { method: 'POST' }).catch(() => {});
    await admin.from('google_tokens').delete().eq('user_id', who.user.id);
    return json({ ok: true });
  }

  if (body.refresh_token) {
    const { error } = await admin.from('google_tokens').upsert({ user_id: who.user.id, refresh_token: await seal(body.refresh_token), updated_at: new Date().toISOString() });
    if (error) return json({ error: 'store-failed' }, 500);
  }

  const { data: row } = await admin.from('google_tokens').select('refresh_token').eq('user_id', who.user.id).maybeSingle();
  if (!row) return json({ error: 'reconnect' }, 401);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: await open(row.refresh_token) }),
  });
  const out = (await res.json()) as { access_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!out.access_token) {
    // invalid_grant: the user revoked access or the token expired. Forget it and ask for a new sign-in.
    if (out.error === 'invalid_grant') await admin.from('google_tokens').delete().eq('user_id', who.user.id);
    return json({ error: 'reconnect' }, 401);
  }
  // `scope` lets the browser see when the user left Google's Drive checkbox unticked.
  return json({ access_token: out.access_token, expires_in: out.expires_in ?? 3600, scope: out.scope ?? '' });
});
