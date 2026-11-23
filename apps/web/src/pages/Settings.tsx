import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { formatBytes, type BoardSummary, type HostInfo, type InstalledPlugin, type StorageInfo } from '@specimen/schema';
import { AppHeader } from '../components/AppHeader';
import { Avatar, Button, Field, Icon, Input, Label, Meter, Segmented, StatusDot, StorageBadge } from '../components/ui';
import { api } from '../lib/api';
import { initials } from '../lib/format';
import { useMotionPref, useTheme } from '../lib/theme';
import { useSession } from '../store/session';
import { toast } from '../store/toast';
import './settings.css';

const TABS = [
  { id: 'account', label: 'Account' },
  { id: 'storage', label: 'Storage' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'import', label: 'Import / Export' },
  { id: 'danger', label: 'Danger zone' },
] as const;

function Account() {
  const session = useSession((s) => s.session)!;
  const load = useSession((s) => s.load);
  const user = session.user!;
  const save = (patch: Parameters<typeof api.updateMe>[0]) => api.updateMe(patch).then(() => load()).then(() => toast('Saved'));
  return (
    <section className="set-sec">
      <h2 className="display">Account</h2>
      <div className="set-profile">
        <Avatar text={initials(user.name)} size={56} />
        <div>
          <div className="serif set-name">{user.name}</div>
          <span className="mono muted">@{user.handle}</span>
        </div>
      </div>
      <div className="set-form">
        <Field label="Name">
          <Input defaultValue={user.name} onBlur={(e) => e.target.value !== user.name && save({ name: e.target.value })} />
        </Field>
        <Field label="Handle">
          <Input mono defaultValue={user.handle} onBlur={(e) => e.target.value !== user.handle && save({ handle: e.target.value })} />
        </Field>
        <Field label="Short bio">
          <textarea className="ui-input" rows={2} defaultValue={user.bio ?? ''} onBlur={(e) => e.target.value !== (user.bio ?? '') && save({ bio: e.target.value })} />
        </Field>
      </div>
      <Label>Sign-in methods</Label>
      <ul className="set-list">
        {session.authMode === 'none' && (
          <li>
            <span>No sign-in. This instance runs with AUTH=none.</span>
          </li>
        )}
        {session.authMode === 'password' && (
          <li>
            <span>Password from the server's PASSWORD setting</span>
            <StatusDot tone="ok">on</StatusDot>
          </li>
        )}
        {user.methods.map((m) => (
          <li key={m.kind}>
            <span>{m.label}</span>
            <StatusDot tone="ok">connected</StatusDot>
          </li>
        ))}
        {session.authMode === 'hosted' &&
          (['google', 'github'] as const)
            .filter((k) => !user.methods.some((m) => m.kind === k) && session.providers[k])
            .map((k) => (
              <li key={k}>
                <span>{k === 'google' ? 'Google' : 'GitHub'}</span>
                <a className="ui-btn ui-btn--secondary ui-btn--sm" href={`/api/auth/oauth/${k}`}>
                  Connect
                </a>
              </li>
            ))}
      </ul>
      {session.authMode !== 'none' && (
        <Button
          variant="ghost"
          onClick={async () => {
            await api.signOut();
            location.href = '/signin';
          }}
        >
          Sign out
        </Button>
      )}
    </section>
  );
}

function Storage() {
  const [list, setList] = useState<StorageInfo[]>([]);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const nav = useNavigate();
  const reload = () => Promise.all([api.storages(true).then(setList), api.boards().then((b) => setBoards(b.boards))]);
  useEffect(() => {
    reload();
  }, []);
  return (
    <section className="set-sec">
      <div className="set-sec-head">
        <h2 className="display">Storage</h2>
        <Button icon="plus" onClick={() => nav('/onboarding')}>
          Add storage
        </Button>
      </div>
      <p className="muted">Each board is saved to one of these. Specimen never stores your files.</p>
      <div className="set-cards">
        {list.map((s) => (
          <div key={s.id} id={s.id} className="set-card">
            <div className="set-card-row">
              <StorageBadge kind={s.kind} />
              <strong>{s.name}</strong>
              {s.isDefault && <span className="ui-pill">default</span>}
              <span className="set-card-status">{s.status === 'ok' ? <StatusDot tone="ok">Connected</StatusDot> : <StatusDot tone="danger">{s.status === 'reconnect' ? 'Reconnect needed' : 'Disconnected'}</StatusDot>}</span>
            </div>
            <div className="mono muted set-card-path">
              {s.account ? `${s.account} · ` : ''}
              {s.root} · {boards.filter((b) => b.storageId === s.id).length} boards
            </div>
            {s.usage && (
              <div className="set-usage">
                <Meter value={s.usage.total ? s.usage.used / s.usage.total : 0} />
                <span className="mono muted">
                  {formatBytes(s.usage.used)}
                  {s.usage.total ? ` of ${formatBytes(s.usage.total)}` : ''}
                </span>
              </div>
            )}
            {s.keyHint && (
              <div className="mono muted">
                secret •••• {s.keyHint} · <Link to="/onboarding">Replace key</Link>
              </div>
            )}
            <div className="set-card-actions">
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
        ))}
      </div>
    </section>
  );
}

const HOST_LABEL: Record<string, string> = { github: 'GitHub Pages', netlify: 'Netlify', cloudflare: 'Cloudflare Pages', server: 'My own server', folder: 'Folder' };

function Publishing() {
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [vis, setVis] = useState<'published' | 'unlisted'>('unlisted');
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  useEffect(() => {
    api.hosts().then(setHosts);
    api.settings().then((s) => setVis(s.defaultVisibility));
    api.boards().then((b) => setBoards(b.boards));
  }, []);
  const add = async (kind: HostInfo['kind']) => {
    const target = prompt(kind === 'folder' ? 'Folder path' : kind === 'github' ? 'Repository (owner/name)' : kind === 'server' ? 'rsync target (user@host:/path)' : kind === 'cloudflare' ? 'account-id/project' : 'Netlify site');
    if (!target) return;
    const token = ['github', 'netlify', 'cloudflare'].includes(kind) ? prompt('Access token') ?? undefined : undefined;
    try {
      const h = await api.saveHost({ kind, name: HOST_LABEL[kind], target, token });
      setHosts([...hosts, h]);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <section className="set-sec">
      <h2 className="display">Publishing</h2>
      <Label>Hosts</Label>
      <ul className="set-list">
        {hosts.map((h) => (
          <li key={h.id}>
            <span>
              <strong>{HOST_LABEL[h.kind]}</strong> <span className="mono muted">{h.target} · {boards.filter((b) => b.publishedUrl?.includes(h.target.split('/').pop() ?? '§')).length} boards</span>
            </span>
            <span className="set-row-r">
              <StatusDot tone={h.connected ? 'ok' : 'muted'}>{h.connected ? 'connected' : 'not connected'}</StatusDot>
              <button type="button" className="panel-x" aria-label="Remove host" onClick={() => api.removeHost(h.id).then(() => setHosts(hosts.filter((x) => x.id !== h.id)))}>
                <Icon name="x" size={12} />
              </button>
            </span>
          </li>
        ))}
        {(['github', 'netlify', 'cloudflare', 'server', 'folder'] as const)
          .filter((k) => !hosts.some((h) => h.kind === k))
          .map((k) => (
            <li key={k}>
              <span>
                {HOST_LABEL[k]}
                {k === 'server' && <span className="mono muted"> SFTP or rsync target</span>}
              </span>
              <Button size="sm" onClick={() => add(k)}>
                {k === 'server' || k === 'folder' ? 'Add' : 'Connect'}
              </Button>
            </li>
          ))}
      </ul>
      <Label>Custom domains</Label>
      <ul className="set-list">
        {hosts.filter((h) => h.domain).map((h) => (
          <li key={h.id}>
            <span className="mono">{h.domain}</span>
            <span className="mono muted">{HOST_LABEL[h.kind]}</span>
          </li>
        ))}
        {!hosts.some((h) => h.domain) && <li className="muted">Set a domain in the Publish dialog of any board.</li>}
      </ul>
      <Label>Default visibility for new boards</Label>
      <Segmented
        value={vis}
        onChange={(v) => (setVis(v), api.updateSettings({ defaultVisibility: v }))}
        options={[
          { value: 'published', label: 'Public' },
          { value: 'unlisted', label: 'Unlisted' },
        ]}
      />
      <p className="muted">Unlisted boards are reachable only by link.</p>
    </section>
  );
}

function Plugins() {
  const [list, setList] = useState<InstalledPlugin[]>([]);
  useEffect(() => {
    api.plugins().then(setList);
  }, []);
  return (
    <section className="set-sec">
      <h2 className="display">Plugins</h2>
      <ul className="set-list">
        {list.map((p) => (
          <li key={p.manifest.id}>
            <span>
              <strong>{p.manifest.name}</strong>{' '}
              <span className="mono muted">
                v{p.manifest.version} · used in {p.usedIn.length} board{p.usedIn.length === 1 ? '' : 's'}
              </span>
            </span>
            <span className="mono muted">{p.manifest.permissions.length ? 'reads inputs' : 'no access'} · {p.builtIn ? 'built in' : 'yours'}</span>
          </li>
        ))}
      </ul>
      <p className="muted">Each board pins the plugin version it was made with, so updates never change a published figure.</p>
    </section>
  );
}

function Appearance() {
  const { pref, setPref } = useTheme();
  const motion = useMotionPref();
  return (
    <section className="set-sec">
      <h2 className="display">Appearance</h2>
      <Label>Theme</Label>
      <div className="set-themes">
        {(['light', 'dark', 'system'] as const).map((t) => (
          <button key={t} type="button" className={`set-theme set-theme--${t}${pref === t ? ' is-on' : ''}`} onClick={() => setPref(t)}>
            <span className="set-theme-swatch" />
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="set-row">
        <span>
          Reduce motion
          <small>Follows your system setting. Figures never auto-play.</small>
        </span>
        <Segmented
          size="sm"
          value={motion.pref}
          onChange={motion.set}
          options={[
            { value: 'system', label: 'System' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </div>
    </section>
  );
}

function ImportExport() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [pick, setPick] = useState('');
  const [over, setOver] = useState(false);
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
    try {
      const r = await api.importBoard(file);
      toast(`Imported “${r.board.title}”`);
      nav(`/b/${r.storageId}/${r.board.slug}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const [sid, slug] = pick.split('/');
  return (
    <section className="set-sec">
      <h2 className="display">Import and export</h2>
      <Label>Export a board</Label>
      <div className="set-export">
        <select className="ui-input" value={pick} onChange={(e) => setPick(e.target.value)}>
          {boards.map((b) => (
            <option key={`${b.storageId}/${b.slug}`} value={`${b.storageId}/${b.slug}`}>
              {b.title}
            </option>
          ))}
        </select>
        <a className="ui-btn ui-btn--secondary ui-btn--md" href={pick ? api.exportUrl(sid, slug) : undefined} download>
          <Icon name="upload" /> Download .zip
        </a>
      </div>
      <p className="mono muted">board.json + media/ + plugins/ + static HTML</p>
      <Label>Import</Label>
      <div
        className={`set-drop${over ? ' is-over' : ''}`}
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
        <span className="serif">Drop a Markdown file or folder (.zip), a .json board or a Specimen .zip</span>
        <span className="muted">Headings become sections. Links, images and code blocks become cards.</span>
      </div>
      <input ref={input} type="file" hidden accept=".md,.markdown,.txt,.json,.zip" onChange={(e) => doImport(e.target.files?.[0])} />
    </section>
  );
}

function Danger() {
  const session = useSession((s) => s.session)!;
  return (
    <section className="set-sec">
      <h2 className="display">Danger zone</h2>
      <div className="set-safe">
        <Icon name="check" /> Your files in storage stay safe. Nothing here deletes boards or media from Google Drive, Dropbox, R2 or OneDrive.
      </div>
      <div className="set-danger">
        <div>
          <strong>Disconnect all storage</strong>
          <p className="muted">Removes Specimen's access tokens. You can reconnect later.</p>
        </div>
        <Button variant="danger" onClick={() => confirm('Disconnect every storage except the local folder?') && api.disconnectAll().then(() => toast('Disconnected'))}>
          Disconnect all
        </Button>
      </div>
      <div className="set-danger">
        <div>
          <strong>Delete account</strong>
          <p className="muted">Deletes your sign-in and profile. Published copies on your hosts are not removed.</p>
        </div>
        <Button variant="danger" disabled={session.authMode === 'none'} onClick={() => confirm('Delete your account? This cannot be undone.') && api.deleteMe().then(() => (location.href = '/'))}>
          Delete account
        </Button>
      </div>
    </section>
  );
}

export default function Settings() {
  const { tab = 'account' } = useParams();
  const Body = { account: Account, storage: Storage, publishing: Publishing, plugins: Plugins, appearance: Appearance, import: ImportExport, danger: Danger }[tab] ?? Account;
  return (
    <div>
      <AppHeader />
      <div className="page set">
        <nav className="set-nav">
          <h1 className="display">Settings</h1>
          {TABS.map((t) => (
            <NavLink key={t.id} to={`/settings/${t.id}`} className={({ isActive }) => (isActive || (t.id === 'account' && tab === 'account') ? 'active' : '')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <Body />
      </div>
    </div>
  );
}

