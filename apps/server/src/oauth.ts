/**
 * Minimal OAuth 2.0 authorization-code flow for the providers Specimen talks to.
 * One table of endpoints; no SDKs. Used for both sign-in (google, github) and storage
 * connections (gdrive, dropbox, onedrive).
 */
export type OAuthProvider = 'google' | 'github' | 'gdrive' | 'dropbox' | 'onedrive';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  /** Epoch ms. */
  expires_at?: number;
}

interface ProviderDef {
  authorize: string;
  token: string;
  scope: string;
  /** Extra query params for the authorize URL (offline access, consent prompt…). */
  extra?: Record<string, string>;
  /** Which client id pair from the config this provider uses. */
  client: 'google' | 'github' | 'dropbox' | 'onedrive';
}

export const PROVIDERS: Record<OAuthProvider, ProviderDef> = {
  google: { client: 'google', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'openid email profile' },
  // drive.file: Specimen sees only files it created, as promised on the onboarding screen.
  gdrive: { client: 'google', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/drive.file email', extra: { access_type: 'offline', prompt: 'consent' } },
  github: { client: 'github', authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', scope: 'read:user user:email' },
  dropbox: { client: 'dropbox', authorize: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', scope: 'files.content.read files.content.write files.metadata.read sharing.write account_info.read', extra: { token_access_type: 'offline' } },
  onedrive: { client: 'onedrive', authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: 'offline_access Files.ReadWrite.AppFolder User.Read' },
};

export interface ClientPair {
  id: string;
  secret: string;
}

/** Builds the URL the browser is sent to. `state` must be checked on return (CSRF). */
export function authorizeUrl(p: OAuthProvider, client: ClientPair, redirectUri: string, state: string): string {
  const d = PROVIDERS[p];
  const q = new URLSearchParams({ client_id: client.id, redirect_uri: redirectUri, response_type: 'code', scope: d.scope, state, ...d.extra });
  return `${d.authorize}?${q}`;
}

async function tokenRequest(p: OAuthProvider, client: ClientPair, body: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(PROVIDERS[p].token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, ...body }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`${p} token error: ${json.error_description ?? json.error ?? res.status}`);
  return { access_token: json.access_token, refresh_token: json.refresh_token, expires_at: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined };
}

/** Exchanges the `code` from the redirect for tokens. */
export function exchangeCode(p: OAuthProvider, client: ClientPair, code: string, redirectUri: string) {
  return tokenRequest(p, client, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

/** Gets a new access token. Keeps the old refresh token when the provider does not rotate it. */
export async function refresh(p: OAuthProvider, client: ClientPair, tokens: OAuthTokens): Promise<OAuthTokens> {
  if (!tokens.refresh_token) throw new ReconnectError(`${p} gave no refresh token`);
  try {
    const next = await tokenRequest(p, client, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    return { ...next, refresh_token: next.refresh_token ?? tokens.refresh_token };
  } catch (e) {
    throw new ReconnectError((e as Error).message);
  }
}

/** The provider no longer accepts our tokens. The UI shows "Reconnect needed"; local work is kept. */
export class ReconnectError extends Error {
  readonly reconnect = true;
}
