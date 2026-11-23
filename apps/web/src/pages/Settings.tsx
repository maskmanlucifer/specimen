import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { formatBytes, type BoardSummary, type InstalledPlugin, type StorageInfo } from '@specimen/schema';
import { cloudConfig } from '../backend/cloud';
import { CloudSetup } from '../components/CloudSetup';
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
        {session.authMode === 'none' ? (
          <Row label="No account" desc="Boards live in this browser only. Sign in with Google to keep them in your Drive.">
            <Link className="ui-btn ui-btn--primary ui-btn--sm" to="/signin?next=/settings/storage">
              Sign in with Google
            </Link>
          </Row>
        ) : (
          <>
            {user.methods.map((m) => (
              <Row key={m.kind} label="Google" desc={m.label}>
                <StatusDot tone="ok">Signed in</StatusDot>
              </Row>
            ))}
            <Row label="Sign out" desc="On this browser only. Your Drive boards stay in your Drive.">
              <Button
                size="sm"
                onClick={async () => {
                  await api.signOut();
                  location.reload();
                }}
              >
                Sign out
              </Button>
            </Row>
          </>
        )}
      </Group>
    </>
  );
}

function Storage() {
  const [list, setList] = useState<StorageInfo[] | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [lastExport, setLastExport] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const session = useSession((s) => s.session)!;
  const cfg = cloudConfig();
  const reload = () => Promise.all([api.storages(true).then(setList), api.boards().then((b) => setBoards(b.boards)), api.lastExport().then(setLastExport)]);
  useEffect(() => {
    reload();
  }, []);
  return (
    <>
      <Head
        title="Storage"
        action={
          session.authMode === 'none' ? (
            <Link className="ui-btn ui-btn--secondary ui-btn--md" to="/signin?next=/settings/storage">
              <Icon name="cloud" size={15} /> Add Google Drive
            </Link>
          ) : undefined
        }
      >
        Each board is saved in one of these places. There is no Specimen server and no copy anywhere else.
      </Head>
      <Group foot="Move a board between places from its Publish dialog or the dashboard.">
        {list === null && <Row label={<Working label="Checking" />} />}
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
                <StatusDot tone="ok">{s.kind === 'local' ? 'On this device' : 'Connected'}</StatusDot>
                {s.kind === 'local' && (
                  <Button size="sm" icon="upload" onClick={() => api.exportBrowser().then(() => api.lastExport().then(setLastExport))}>
                    Export all
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </Group>
      {list?.some((s) => s.kind === 'local') && (
        <div className={cx('backup', lastExport && Date.now() - lastExport < 7 * 864e5 ? 'is-ok' : 'is-warn')}>
          <Icon name={lastExport && Date.now() - lastExport < 7 * 864e5 ? 'check' : 'alert'} size={15} />
          <span>{lastExport ? `Last backup ${new Date(lastExport).toLocaleDateString()}.` : 'No backup yet.'} Boards in this browser are lost if site data is cleared. Export a .zip from time to time.</span>
        </div>
      )}
      <Group title="Your Supabase project" foot="Supabase signs you in with Google and keeps the Drive key in an Edge Function you own.">
        {editing ? (
          <div className="sr-pad">
            <CloudSetup onCancel={() => setEditing(false)} onSaved={() => location.reload()} />
          </div>
        ) : (
          <Row label={cfg ? 'Project' : 'Not set up'} desc={cfg ? <span className="mono">{cfg.url.replace('https://', '')}</span> : 'Needed only for Google Drive.'}>
            {cfg && <StatusDot tone="ok">Ready</StatusDot>}
            <Button size="sm" onClick={() => setEditing(true)}>
              {cfg ? 'Change' : 'Set up'}
            </Button>
          </Row>
        )}
      </Group>
    </>
  );
}

function Publishing() {
  const [vis, setVis] = useState<'published' | 'unlisted'>('unlisted');
  useEffect(() => {
    api.settings().then((s) => setVis(s.defaultVisibility));
  }, []);
  return (
    <>
      <Head title="Publishing">Two ways to share a board. Choose one in the Publish dialog of any board.</Head>
      <Group title="Ways to publish">
        <Row lead={<span className="host-badge mono">GD</span>} label="Share link" desc="A public copy in your Google Drive. Readers open the link without signing in. Needs the board in Google Drive." />
        <Row lead={<span className="host-badge mono">ZIP</span>} label="Static site" desc="Downloads plain HTML, JS and media. Put the folder on any host, for example a GitHub Pages repo." />
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
      <Group title="Export" foot="board.json and media/: the open format. Import it here or open it in any editor.">
        <Row label="Board">
          <select className="ui-input sr-select" value={pick} onChange={(e) => setPick(e.target.value)}>
            {boards.map((b) => (
              <option key={`${b.storageId}/${b.slug}`} value={`${b.storageId}/${b.slug}`}>
                {b.title}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" disabled={!pick} onClick={() => api.exportBoard(sid, slug).catch((e) => toast((e as Error).message))}>
            Download .zip
          </Button>
        </Row>
        <Row label="Everything in this browser" desc="Every board, media file and plugin stored in this browser, in one .zip. Use it as a backup.">
          <Button size="sm" icon="upload" onClick={() => api.exportBrowser().catch((e) => toast((e as Error).message))}>
            Export all
          </Button>
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
        Nothing here deletes boards or media from your Google Drive.
      </div>
      <Group tone="danger">
        <Row label="Disconnect Google" desc={session.authMode === 'hosted' ? 'Revokes Drive access and deletes the stored key in your Supabase. You can sign in again later.' : 'Not signed in.'}>
          <Button size="sm" variant="danger" disabled={session.authMode !== 'hosted'} onClick={() => confirm('Disconnect Google? Drive boards stay in your Drive.') && api.disconnectGoogle().then(() => location.reload())}>
            Disconnect
          </Button>
        </Row>
        <Row label="Clear this browser" desc="Deletes every board, media file, plugin and setting stored in this browser. Export first if you need them.">
          <Button size="sm" variant="danger" onClick={() => confirm('Delete everything stored in this browser? This cannot be undone. Export a backup first if you need it.') && api.clearBrowser()}>
            Clear data
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
