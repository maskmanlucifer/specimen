import type {
  ActivityItem,
  Board,
  BoardResponse,
  BoardSummary,
  HostInfo,
  InstalledPlugin,
  PluginBundle,
  PublicFile,
  PublishRequest,
  PublishResult,
  Session,
  Settings,
  StorageCredentials,
  StorageInfo,
  StorageKind,
  StorageTestResult,
  User,
} from '@specimen/schema';

/** An API error with the HTTP status and the parsed body (e.g. the newer board on a 409). */
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

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: json !== undefined ? { 'content-type': 'application/json', ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'You are offline');
  }
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : {};
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText, body);
  return body as T;
}

const enc = encodeURIComponent;
const boardPath = (sid: string, slug: string) => `/boards/${enc(sid)}/${enc(slug)}`;

/** Typed client for `apps/server`. One function per endpoint. */
export const api = {
  session: () => call<Session>('/session'),
  signInPassword: (password: string) => call('/auth/password', { method: 'POST', json: { password } }),
  signInEmail: (email: string) => call('/auth/email', { method: 'POST', json: { email } }),
  signOut: () => call('/auth/signout', { method: 'POST' }),
  updateMe: (patch: Partial<Pick<User, 'name' | 'handle' | 'bio'>>) => call<User>('/me', { method: 'PATCH', json: patch }),
  deleteMe: () => call('/me', { method: 'DELETE' }),

  settings: () => call<Settings>('/settings'),
  updateSettings: (patch: Partial<Settings>) => call<Settings>('/settings', { method: 'PATCH', json: patch }),
  finishOnboarding: () => call('/onboarded', { method: 'POST' }),
  search: (q: string) => call<{ storageId: string; slug: string; board: string; cardId?: string; label: string; text: string }[]>(`/search?q=${enc(q)}`),
  activity: () => call<ActivityItem[]>('/activity'),
  unfurl: (url: string) => call<{ url: string; site: string; title?: string; description?: string; image?: string }>(`/unfurl?url=${enc(url)}`),

  storages: (usage = false) => call<StorageInfo[]>(`/storages${usage ? '?usage=1' : ''}`),
  testStorage: (kind: StorageKind, credentials: StorageCredentials, root?: string) => call<StorageTestResult>('/storages/test', { method: 'POST', json: { kind, credentials, root } }),
  saveStorage: (body: { id?: string; kind: StorageKind; name?: string; root?: string; credentials: StorageCredentials }) => call<StorageInfo>('/storages', { method: 'POST', json: body }),
  updateStorage: (id: string, patch: { name?: string; root?: string; isDefault?: boolean }) => call<StorageInfo>(`/storages/${enc(id)}`, { method: 'PATCH', json: patch }),
  removeStorage: (id: string) => call(`/storages/${enc(id)}`, { method: 'DELETE' }),
  disconnectAll: () => call('/storages', { method: 'DELETE' }),
  /** OAuth providers: a full-page redirect, not a fetch. */
  connectUrl: (kind: StorageKind, opts: { id?: string; root?: string } = {}) => `/api/storages/connect/${kind}?${new URLSearchParams(Object.entries(opts).filter(([, v]) => v) as [string, string][])}`,

  boards: () => call<{ boards: BoardSummary[]; errors: { storageId: string; message: string }[] }>('/boards'),
  createBoard: (title: string, storageId?: string, template?: string) => call<{ storageId: string; board: Board }>('/boards', { method: 'POST', json: { title, storageId, template } }),
  board: (sid: string, slug: string) => call<BoardResponse>(boardPath(sid, slug)),
  saveBoard: (sid: string, slug: string, board: Board, baseRev: number, force = false) => call<{ board: Board }>(boardPath(sid, slug), { method: 'PUT', json: { board, baseRev, force } }),
  moveBoard: (sid: string, slug: string, to: string) => call<{ storageId: string; board: Board }>(`${boardPath(sid, slug)}/move`, { method: 'POST', json: { to } }),
  boardFiles: (sid: string, slug: string) => call<{ path: string; size: number }[]>(`${boardPath(sid, slug)}/files`),
  mediaUrl: (sid: string, slug: string, path: string) => `/api${boardPath(sid, slug)}/${path.split('/').map(enc).join('/')}`,
  uploadPart: (sid: string, slug: string, q: { id: string; name: string; offset: number; total: number }, part: Blob, type: string) =>
    call<{ received: number; src?: string; size?: number }>(`${boardPath(sid, slug)}/upload?${new URLSearchParams({ ...q, offset: String(q.offset), total: String(q.total) })}`, { method: 'POST', body: part, headers: { 'x-content-type': type } }),
  uploadStatus: (sid: string, slug: string, id: string) => call<{ received: number }>(`${boardPath(sid, slug)}/upload/${enc(id)}`),
  exportUrl: (sid: string, slug: string) => `/api${boardPath(sid, slug)}/export`,
  importBoard: (file: File, storageId?: string) => call<{ storageId: string; board: Board }>(`/boards/import?${new URLSearchParams({ name: file.name, ...(storageId ? { storageId } : {}) })}`, { method: 'POST', body: file }),

  plugins: () => call<InstalledPlugin[]>('/plugins'),
  plugin: (id: string) => call<PluginBundle>(`/plugins/${enc(id)}`),
  savePlugin: (bundle: PluginBundle) => call(`/plugins/${enc(bundle.manifest.id)}`, { method: 'PUT', json: bundle }),

  hosts: () => call<HostInfo[]>('/hosts'),
  saveHost: (body: Omit<HostInfo, 'id' | 'connected'> & { id?: string; token?: string }) => call<HostInfo>('/hosts', { method: 'POST', json: body }),
  removeHost: (id: string) => call(`/hosts/${enc(id)}`, { method: 'DELETE' }),
  publicFiles: (sid: string, slug: string) => call<PublicFile[]>(`${boardPath(sid, slug)}/publish/files`),
  publish: (sid: string, slug: string, req: PublishRequest) => call<PublishResult & { board: Board }>(`${boardPath(sid, slug)}/publish`, { method: 'POST', json: req }),
  unpublish: (sid: string, slug: string) => call<{ board: Board }>(`${boardPath(sid, slug)}/publish`, { method: 'DELETE' }),
};
