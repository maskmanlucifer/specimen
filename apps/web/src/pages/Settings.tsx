import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { formatBytes, type BoardSummary, type HostInfo, type HostKind, type InstalledPlugin, type StorageInfo } from '@specimen/schema';
import { AppHeader } from '../components/AppHeader';
import { IsoTray } from '../components/Iso';
import { Avatar, Button, Icon, Input, Label, Meter, Segmented, StatusDot, StorageBadge, TypeMark, Working, type IconName } from '../components/ui';
import { api } from '../lib/api';
import { cx, initials } from '../lib/format';
import { useMotionPref, useTheme } from '../lib/theme';
import { useSession } from '../store/session';
import { toast } from '../store/toast';
import './settings.css';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'account', label: 'Account', icon: 'user' },
  { id: 'storage', label: 'Storage', icon: 'cloud' },
  { id: 'publishing', label: 'Publishing', icon: 'globe' },
  { id: 'plugins', label: 'Plugins', icon: 'puzzle' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'import', label: 'Import / Export', icon: 'box' },
  { id: 'danger', label: 'Danger zone', icon: 'alert' },
];

/* ---------- Building blocks ---------- */

/** Tab heading: title, one line of context, optional action on the right. */
function Head({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <header className="set-head">
      <div>
        <h2 className="display">{title}</h2>
        <p>{children}</p>
      </div>
      {action}
    </header>
  );
}

/** A titled group of rows in one bordered box (settings-app style). */
function Group({ title, children, foot, tone, action }: { title?: string; children: ReactNode; foot?: ReactNode; tone?: 'danger'; action?: ReactNode }) {
  return (
    <section className="sg">
      {(title || action) && (
        <div className="sg-head">
          {title && <Label>{title}</Label>}
          {action}
        </div>
      )}
      <div className={cx('sg-box', tone && `sg-box--${tone}`)}>{children}</div>
      {foot && <p className="sg-foot">{foot}</p>}
    </section>
  );
}

/** One row: what it is on the left, the control on the right. */
function Row({ label, desc, children, lead }: { label: ReactNode; desc?: ReactNode; children?: ReactNode; lead?: ReactNode }) {
  return (
    <div className="sr">
      {lead && <div className="sr-lead">{lead}</div>}
      <div className="sr-text">
        <strong>{label}</strong>
        {desc && <span>{desc}</span>}
      </div>
      {children && <div className="sr-ctl">{children}</div>}
    </div>
  );
}

/* ---------- Tabs ---------- */

function Account() {
  const session = useSession((s) => s.session)!;
  const load = useSession((s) => s.load);
  const user = session.user!;
  const save = (patch: Parameters<typeof api.updateMe>[0]) => api.updateMe(patch).then(() => load()).then(() => toast('Profile saved'));
  return (
    <>
      <Head title="Account">Your name and handle appear on boards you publish.</Head>
      <Group title="Profile">
        <Row lead={<Avatar text={initials(user.name)} size={44} />} label={user.name} desc={<span className="mono">@{user.handle}</span>} />
        <Row label="Name" desc="Shown as the byline of published stories.">
          <Input className="sr-input" defaultValue={user.name} onBlur={(e) => e.target.value !== user.name && save({ name: e.target.value })} />
        </Row>
        <Row label="Handle" desc="Lower-case letters, digits and dashes.">
          <span className="sr-prefix">
            <span className="mono">@</span>
            <Input mono className="sr-input" defaultValue={user.handle} onBlur={(e) => e.target.value !== user.handle && save({ handle: e.target.value })} />
          </span>
        </Row>
        <Row label="Short bio" desc="One or two lines about you.">
          <textarea className="ui-input sr-input" rows={2} defaultValue={user.bio ?? ''} onBlur={(e) => e.target.value !== (user.bio ?? '') && save({ bio: e.target.value })} />
        </Row>
      </Group>
      <Group title="Sign-in">
        {session.authMode === 'none' && <Row label="No sign-in" desc="This instance runs with AUTH=none: anyone who can reach it is you." />}
        {session.authMode === 'password' && (
          <Row label="Password" desc="Set by the server's PASSWORD setting.">
            <StatusDot tone="ok">On</StatusDot>
          </Row>
        )}
        {user.methods.map((m) => (
          <Row key={m.kind} label={m.label}>
            <StatusDot tone="ok">Connected</StatusDot>
          </Row>
        ))}
        {session.authMode === 'hosted' &&
          (['google', 'github'] as const)
            .filter((k) => !user.methods.some((m) => m.kind === k) && session.providers[k])
            .map((k) => (
              <Row key={k} label={k === 'google' ? 'Google' : 'GitHub'} desc="Not connected">
                <a className="ui-btn ui-btn--secondary ui-btn--sm" href={`/api/auth/oauth/${k}`}>
                  Connect
                </a>
              </Row>
            ))}
        {session.authMode !== 'none' && (
          <Row label="Sign out" desc="On this browser only.">
            <Button
              size="sm"
              onClick={async () => {
                await api.signOut();
                location.href = '/signin';
              }}
            >
              Sign out
            </Button>
          </Row>
        )}
      </Group>
    </>
  );
}

function Storage() {
  const [list, setList] = useState<StorageInfo[] | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const nav = useNavigate();
  const reload = () => Promise.all([api.storages(true).then(setList), api.boards().then((b) => setBoards(b.boards))]);
  useEffect(() => {
    reload();
  }, []);
  return (
    <>
      <Head
        title="Storage"
        action={
          <Button icon="plus" onClick={() => nav('/onboarding')}>
            Add storage
          </Button>
        }
      >
        Each board is saved to one of these places. Specimen never keeps a copy.
      </Head>
      <Group foot="Disconnecting removes Specimen's access only. Your files stay where they are.">
        {list === null && <Row label={<Working label="Checking connections" />} />}
        {list?.map((s) => {
          const n = boards.filter((b) => b.storageId === s.id).length;
          return (
            <div key={s.id} id={s.id} className="sr sr--storage">
              <div className="sr-lead">
                <StorageBadge kind={s.kind} />
              </div>
              <div className="sr-text">
                <strong>
                  {s.name} {s.isDefault && <span className="ui-pill">default</span>}
                </strong>
                <span className="mono">
                  {s.account ? `${s.account} · ` : ''}
                  {s.root} · {n} board{n === 1 ? '' : 's'}
                  {s.keyHint ? ` · key •••• ${s.keyHint}` : ''}
                </span>
                {s.usage && (
                  <span className="sr-usage">
                    <Meter value={s.usage.total ? Math.max(0.015, s.usage.used / s.usage.total) : 0} tone="accent" />
                    <span className="mono">
                      {formatBytes(s.usage.used)}
                      {s.usage.total ? ` of ${formatBytes(s.usage.total)}` : ''}
                    </span>
                  </span>
                )}
              </div>
              <div className="sr-ctl">
                {s.status === 'ok' ? <StatusDot tone="ok">Connected</StatusDot> : <StatusDot tone="danger">{s.status === 'reconnect' ? 'Reconnect needed' : 'Disconnected'}</StatusDot>}
                {s.status !== 'ok' && ['gdrive', 'dropbox', 'onedrive'].includes(s.kind) && (
                  <Button size="sm" variant="primary" onClick={() => (location.href = api.connectUrl(s.kind, { id: s.id, root: s.root }))}>
                    Reconnect
                  </Button>
                )}
                {!s.isDefault && (
                  <Button size="sm" onClick={() => api.updateStorage(s.id, { isDefault: true }).then(reload)}>
                    Make default
                  </Button>
                )}
                {s.kind !== 'local' && (
                  <Button size="sm" variant="danger" onClick={() => confirm(`Disconnect ${s.name}? Files in it stay where they are.`) && api.removeStorage(s.id).then(reload)}>
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </Group>
    </>
  );
}

const HOSTS: { kind: HostKind; name: string; badge: string; target: string; placeholder: string; token?: string; desc: string }[] = [
  { kind: 'github', name: 'GitHub Pages', badge: 'GH', target: 'Repository', placeholder: 'owner/specimen-boards', token: 'Token (contents: write)', desc: 'Commits to gh-pages, one folder per board.' },
  { kind: 'netlify', name: 'Netlify', badge: 'NL', target: 'Site', placeholder: 'my-notes.netlify.app', token: 'Personal access token', desc: 'Deploys all your boards as one site.' },
  { kind: 'cloudflare', name: 'Cloudflare Pages', badge: 'CF', target: 'Account id / project', placeholder: '8f2c…e41/specimen', token: 'API token (Pages: edit)', desc: 'Deploys with wrangler.' },
  { kind: 'server', name: 'My own server', badge: 'SV', target: 'rsync target', placeholder: 'me@host:/var/www/boards', desc: 'rsync over SSH with your keys.' },
  { kind: 'folder', name: 'Folder', badge: 'FD', target: 'Folder path', placeholder: '/Users/me/site/public/boards', desc: 'Writes static copies into any folder, e.g. your site’s public/.' },
];

/** Middle-truncates long paths so both the start and the end stay readable. */
function middle(s: string, max = 52): string {
  return s.length <= max ? s : `${s.slice(0, Math.ceil(max / 2) - 1)}…${s.slice(-Math.floor(max / 2))}`;
}

/** Inline connect form that opens inside a host row (no browser prompts). */
function HostForm({ def, onSaved, onCancel }: { def: (typeof HOSTS)[number]; onSaved: (h: HostInfo) => void; onCancel: () => void }) {
  const [target, setTarget] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="host-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          onSaved(await api.saveHost({ kind: def.kind, name: def.name, target: target.trim(), token: token.trim() || undefined }));
        } catch (err) {
          toast((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <label>
        <span className="sp-label">{def.target}</span>
        <Input mono autoFocus value={target} onChange={(e) => setTarget(e.target.value)} placeholder={def.placeholder} />
      </label>
      {def.token && (
        <label>
          <span className="sp-label">{def.token}</span>
          <Input mono type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Encrypted on this server" />
        </label>
      )}
      <div className="host-form-actions">
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" disabled={busy || !target.trim() || (!!def.token && !token.trim())}>
          {busy ? <Working label="Saving" /> : `Connect ${def.name}`}
        </Button>
      </div>
    </form>
  );
}

function Publishing() {
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [vis, setVis] = useState<'published' | 'unlisted'>('unlisted');
  const [opening, setOpening] = useState<HostKind | null>(null);
  useEffect(() => {
    api.hosts().then(setHosts);
    api.settings().then((s) => setVis(s.defaultVisibility));
  }, []);
  return (
    <>
      <Head title="Publishing">Where static copies of your boards go, and how new boards start out.</Head>
      <Group title="Hosts">
        {HOSTS.map((def) => {
          const h = hosts.find((x) => x.kind === def.kind);
          return (
            <div key={def.kind} className={cx('sr-wrap', opening === def.kind && 'is-open')}>
              <Row lead={<span className="host-badge mono">{def.badge}</span>} label={def.name} desc={h ? <span className="mono" title={h.target}>{middle(h.target)}</span> : def.desc}>
                {h ? (
                  <>
                    <StatusDot tone={h.connected ? 'ok' : 'muted'}>{h.connected ? 'Connected' : 'Not connected'}</StatusDot>
                    <button type="button" className="sr-x" aria-label={`Remove ${def.name}`} onClick={() => api.removeHost(h.id).then(() => setHosts(hosts.filter((x) => x.id !== h.id)))}>
                      <Icon name="x" size={13} />
                    </button>
                  </>
                ) : opening !== def.kind ? (
                  <Button size="sm" onClick={() => setOpening(def.kind)}>
                    {def.kind === 'server' || def.kind === 'folder' ? 'Add' : 'Connect'}
                  </Button>
                ) : null}
              </Row>
              {opening === def.kind && (
                <HostForm
                  def={def}
                  onCancel={() => setOpening(null)}
                  onSaved={(saved) => {
                    setHosts([...hosts, saved]);
                    setOpening(null);
                    toast(`${def.name} connected`);
                  }}
                />
              )}
            </div>
          );
        })}
      </Group>
      <Group title="Defaults">
        <Row label="Visibility of new boards" desc="Unlisted boards are reachable only by their link.">
          <Segmented
            size="sm"
            value={vis}
            onChange={(v) => (setVis(v), api.updateSettings({ defaultVisibility: v }).then(() => toast('Default saved')))}
            options={[
              { value: 'unlisted', label: 'Unlisted' },
              { value: 'published', label: 'Public' },
            ]}
          />
        </Row>
        <Row label="Custom domains" desc={hosts.some((h) => h.domain) ? hosts.filter((h) => h.domain).map((h) => h.domain).join(' · ') : 'Set a domain in the Publish dialog of any board.'} />
      </Group>
    </>
  );
}

const CATEGORY_MARK: Record<string, string> = { figures: 'figure', audio: 'audio', data: 'link', math: 'math' };

function Plugins() {
  const [list, setList] = useState<InstalledPlugin[]>([]);
  useEffect(() => {
    api.plugins().then(setList);
  }, []);
  return (
    <>
      <Head
        title="Plugins"
        action={
          <Link className="ui-btn ui-btn--secondary ui-btn--md" to="/plugins">
            Open library
          </Link>
        }
      >
        Each board pins the version it was made with, so updates never change a published figure.
      </Head>
      <Group>
        {list.map((p) => (
          <Row
            key={p.manifest.id}
            lead={<TypeMark type={CATEGORY_MARK[p.manifest.category] ?? 'note'} />}
            label={
              <>
                {p.manifest.name} <span className="mono muted sr-ver">v{p.manifest.version}</span>
              </>
            }
            desc={`Used in ${p.usedIn.length} board${p.usedIn.length === 1 ? '' : 's'} · ${p.manifest.permissions.length ? 'reads linked cards' : 'no access'} · ${p.builtIn ? 'built in' : 'yours'}`}
          >
            <Link className="ui-btn ui-btn--ghost ui-btn--sm" to={`/plugins/${p.manifest.id}/edit`}>
              {p.builtIn ? 'Source' : 'Edit'}
            </Link>
          </Row>
        ))}
      </Group>
    </>
  );
}

/** A tiny, real-colour preview of the app in one theme: top bar, a section, three cards. */
function ThemePreview({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <span className="tp" data-theme={theme}>
      <i className="tp-bar" />
      <i className="tp-section">
        <i className="tp-card tp-card--a" />
        <i className="tp-card tp-card--b" />
        <i className="tp-card tp-card--c" />
      </i>
      <i className="tp-pill" />
    </span>
  );
}

function Appearance() {
  const { pref, setPref } = useTheme();
  const motion = useMotionPref();
  return (
    <>
      <Head title="Appearance">Saved on this browser.</Head>
      <Group title="Theme">
        <div className="themes">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button key={t} type="button" className={cx('theme', pref === t && 'is-on')} aria-pressed={pref === t} onClick={() => setPref(t)}>
              <span className="theme-art">
                {t === 'system' ? (
                  <>
                    <ThemePreview theme="light" />
                    <ThemePreview theme="dark" />
                  </>
                ) : (
                  <ThemePreview theme={t} />
                )}
                {pref === t && (
                  <span className="theme-check">
                    <Icon name="check" size={12} />
                  </span>
                )}
              </span>
              <span className="theme-name">{t === 'system' ? 'Match system' : t[0].toUpperCase() + t.slice(1)}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Motion">
        <Row label="Reduce motion" desc="Follows your system unless you choose. Figures never auto-play either way.">
          <Segmented
            size="sm"
            value={motion.pref}
            onChange={motion.set}
            options={[
              { value: 'system', label: 'System' },
              { value: 'on', label: 'Reduce' },
              { value: 'off', label: 'Full' },
            ]}
          />
        </Row>
      </Group>
    </>
  );
}

function ImportExport() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [pick, setPick] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    api.boards().then((b) => {
      setBoards(b.boards);
      if (b.boards[0]) setPick(`${b.boards[0].storageId}/${b.boards[0].slug}`);
    });
  }, []);
  const doImport = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.importBoard(file);
      toast(`Imported “${r.board.title}”`);
      nav(`/b/${r.storageId}/${r.board.slug}`);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  const [sid, slug] = pick.split('/');
  return (
    <>
      <Head title="Import and export">Boards are open files: take them anywhere, bring notes in from anywhere.</Head>
      <Group title="Export" foot="board.json + media/ + plugins/ + a static HTML copy, in one .zip.">
        <Row label="Board">
          <select className="ui-input sr-select" value={pick} onChange={(e) => setPick(e.target.value)}>
            {boards.map((b) => (
              <option key={`${b.storageId}/${b.slug}`} value={`${b.storageId}/${b.slug}`}>
                {b.title}
              </option>
            ))}
          </select>
          <a className="ui-btn ui-btn--primary ui-btn--sm" href={pick ? api.exportUrl(sid, slug) : undefined} download>
            Download .zip
          </a>
        </Row>
      </Group>
      <Group title="Import">
        <div
          className={cx('drop', over && 'is-over')}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            doImport(e.dataTransfer.files[0]);
          }}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
        >
          <span className="drop-art">
            <IsoTray callouts={false} />
          </span>
          <span className="drop-text">
            {busy ? (
              <Working label="Importing" />
            ) : (
              <>
                <strong>{over ? 'Drop to import' : 'Drop a file here, or click to choose'}</strong>
                <span>Markdown (.md or a .zip folder), a board .json, or a Specimen .zip.</span>
                <span className="mono">Headings → sections · links, images, code → cards</span>
              </>
            )}
          </span>
        </div>
        <input ref={input} type="file" hidden accept=".md,.markdown,.txt,.json,.zip" onChange={(e) => doImport(e.target.files?.[0])} />
      </Group>
    </>
  );
}

function Danger() {
  const session = useSession((s) => s.session)!;
  return (
    <>
      <Head title="Danger zone">Actions here cannot be undone.</Head>
      <div className="safe">
        <Icon name="check" size={15} />
        Your files in storage stay safe. Nothing here deletes boards or media from Google Drive, Dropbox, R2 or OneDrive.
      </div>
      <Group tone="danger">
        <Row label="Disconnect all storage" desc="Removes Specimen's access tokens. You can reconnect later.">
          <Button size="sm" variant="danger" onClick={() => confirm('Disconnect every storage except the local folder?') && api.disconnectAll().then(() => toast('Disconnected'))}>
            Disconnect all
          </Button>
        </Row>
        <Row label="Delete account" desc={session.authMode === 'none' ? 'Not available: this instance has no sign-in.' : 'Deletes your sign-in and profile. Published copies on your hosts are not removed.'}>
          <Button size="sm" variant="danger" disabled={session.authMode === 'none'} onClick={() => confirm('Delete your account? This cannot be undone.') && api.deleteMe().then(() => (location.href = '/'))}>
            Delete account
          </Button>
        </Row>
      </Group>
    </>
  );
}

export default function Settings() {
  const { tab = 'account' } = useParams();
  const Body = { account: Account, storage: Storage, publishing: Publishing, plugins: Plugins, appearance: Appearance, import: ImportExport, danger: Danger }[tab] ?? Account;
  return (
    <div>
      <AppHeader />
      <div className="set">
        <nav className="set-nav" aria-label="Settings">
          <h1 className="display">Settings</h1>
          {TABS.map((t) => (
            <NavLink key={t.id} to={`/settings/${t.id}`} className={({ isActive }) => cx(isActive || (t.id === 'account' && tab === 'account') ? 'active' : '', t.id === 'danger' && 'is-danger')}>
              <Icon name={t.icon} size={16} />
              {t.label}
            </NavLink>
          ))}
        </nav>
        <main className="set-main">
          <Body />
        </main>
      </div>
    </div>
  );
}
