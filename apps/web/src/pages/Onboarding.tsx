import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatBytes, sampleBoards, slugify, STORAGE_BADGE, STORAGE_NAME, type StorageCredentials, type StorageInfo, type StorageKind, type StorageTestResult } from '@specimen/schema';
import { Button, Field, Icon, Input, Label, Logo, StorageBadge, Working } from '../components/ui';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { useSession } from '../store/session';
import { toast } from '../store/toast';
import './onboarding.css';

const OAUTH: StorageKind[] = ['gdrive', 'dropbox', 'onedrive'];
const GROUPS: { label: string; kinds: StorageKind[] }[] = [
  { label: 'Cloud drives', kinds: ['gdrive', 'dropbox', 'onedrive'] },
  { label: 'Buckets', kinds: ['r2', 's3'] },
  { label: 'Your own', kinds: ['nextcloud', 'webdav', 'local'] },
];
const DESC: Record<StorageKind, string> = {
  gdrive: 'Only files Specimen creates',
  dropbox: 'An app folder in your Dropbox',
  onedrive: 'An app folder in your OneDrive',
  s3: 'Any S3 bucket and access key',
  r2: 'S3-compatible, no egress fees',
  webdav: 'Any WebDAV server',
  nextcloud: 'Your Nextcloud or ownCloud',
  local: 'A folder on this server',
};

function Steps({ step }: { step: number }) {
  return (
    <ol className="ob-steps">
      {['Storage', 'Folder', 'First board'].map((s, i) => (
        <li key={s} className={cx(i + 1 === step && 'is-on', i + 1 < step && 'is-done')}>
          <span className="mono">{i + 1 < step ? '✓' : i + 1}</span> {s}
        </li>
      ))}
    </ol>
  );
}

function Tree({ root, slug }: { root: string; slug: string }) {
  return (
    <pre className="ob-tree mono">
      {`${root}/
  settings.json
  ${slug}/
    board.json        `}
      <span>cards, positions, links</span>
      {`
    media/clip-01.mp3
    plugins/          `}
      <span>pinned versions</span>
      {`
    published/        `}
      <span>static copies</span>
    </pre>
  );
}

/** Explains the OAuth scope in plain words before leaving for the provider (4f). */
function Permissions({ kind, onBack }: { kind: StorageKind; onBack: () => void }) {
  const name = STORAGE_NAME[kind];
  const providers = useSession((s) => s.session?.providers);
  const configured = kind === 'gdrive' ? providers?.google : kind === 'dropbox' ? providers?.dropbox : providers?.onedrive;
  return (
    <div className="ob-main">
      <h1 className="display">
        Before you go to <em>{name.split(' ')[0]}</em>
      </h1>
      <p className="read muted">{name} will ask you to allow access. Here is exactly what that means, in plain words.</p>
      <div className="ob-perm">
        <Label tone="accent">Specimen can</Label>
        <ul>
          <li>✓ See and change only the files it creates, inside /Specimen</li>
          <li>✓ Make share links for boards you publish, when you ask</li>
        </ul>
        <Label tone="hot">Specimen cannot</Label>
        <ul>
          <li>✕ See your other files, photos or documents</li>
          <li>✕ Delete anything outside its own folder</li>
          <li>✕ Keep a copy of your files on its servers</li>
        </ul>
        <p className="mono muted">Scope requested: {kind === 'gdrive' ? 'drive.file' : kind === 'dropbox' ? 'app folder' : 'Files.ReadWrite.AppFolder'} · Revoke any time in your {name.split(' ')[0]} account</p>
      </div>
      {!configured && <p className="ob-warn">This server has no {name} client id yet. Set {kind === 'gdrive' ? 'GOOGLE' : kind.toUpperCase()}_CLIENT_ID and _CLIENT_SECRET, or pick another storage.</p>}
      <div className="ob-actions">
        <Button onClick={onBack}>Choose another</Button>
        <Button variant="primary" disabled={!configured} onClick={() => (window.location.href = api.connectUrl(kind))}>
          Continue to {name.split(' ')[0]}
        </Button>
      </div>
    </div>
  );
}

/** Key form for S3, R2, WebDAV, Nextcloud and local folders, with a live test (4g/4h). */
function KeyForm({ kind, onBack, onSaved }: { kind: StorageKind; onBack: () => void; onSaved: (s: StorageInfo) => void }) {
  const dataDir = useSession((s) => s.session?.dataDir ?? '');
  const [c, setC] = useState<StorageCredentials>(kind === 'local' ? { path: `${dataDir}/Specimen` } : kind === 'r2' ? { region: 'auto' } : { region: 'us-east-1' });
  const [root, setRoot] = useState('/Specimen');
  const [test, setTest] = useState<StorageTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const set = (k: keyof StorageCredentials) => (e: React.ChangeEvent<HTMLInputElement>) => (setC({ ...c, [k]: e.target.value }), setTest(null));
  const bucket = kind === 's3' || kind === 'r2';
  const dav = kind === 'webdav' || kind === 'nextcloud';

  const run = async () => {
    setTesting(true);
    try {
      setTest(await api.testStorage(kind, c, root));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setTesting(false);
    }
  };
  const save = async () => {
    try {
      onSaved(await api.saveStorage({ kind, root: kind === 'local' ? '/' : root, credentials: c }));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="ob-main">
      <h1 className="display">
        Connect <em>{STORAGE_NAME[kind]}</em>
      </h1>
      <p className="read muted">{bucket ? 'Any S3-compatible bucket works. ' : ''}Keys are encrypted on this server and never shown again after saving.</p>
      <div className="ob-form">
        {kind === 'local' && (
          <Field label="Folder on this server" hint="Created if it does not exist.">
            <Input mono value={c.path ?? ''} onChange={set('path')} />
          </Field>
        )}
        {(bucket || dav) && (
          <Field label="Endpoint">
            <Input mono value={c.endpoint ?? ''} onChange={set('endpoint')} placeholder={kind === 'r2' ? 'https://<account>.r2.cloudflarestorage.com' : kind === 's3' ? 'https://s3.us-east-1.amazonaws.com' : 'https://cloud.example.com/remote.php/dav/files/me'} />
          </Field>
        )}
        {bucket && (
          <div className="ob-two">
            <Field label="Bucket">
              <Input mono value={c.bucket ?? ''} onChange={set('bucket')} placeholder="research" />
            </Field>
            <Field label="Region">
              <Input mono value={c.region ?? ''} onChange={set('region')} />
            </Field>
          </div>
        )}
        {bucket && (
          <>
            <Field label="Access key ID">
              <Input mono value={c.accessKeyId ?? ''} onChange={set('accessKeyId')} autoComplete="off" />
            </Field>
            <Field label="Secret access key">
              <div className="auth-pw">
                <Input mono type={showSecret ? 'text' : 'password'} value={c.secretAccessKey ?? ''} onChange={set('secretAccessKey')} autoComplete="off" />
                <button type="button" className="mono" onClick={() => setShowSecret(!showSecret)}>
                  {showSecret ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>
          </>
        )}
        {dav && (
          <div className="ob-two">
            <Field label="Username">
              <Input mono value={c.username ?? ''} onChange={set('username')} autoComplete="off" />
            </Field>
            <Field label="App password">
              <Input mono type="password" value={c.password ?? ''} onChange={set('password')} autoComplete="off" />
            </Field>
          </div>
        )}
        {kind !== 'local' && (
          <Field label="Folder prefix">
            <Input mono value={root} onChange={(e) => setRoot(e.target.value)} />
          </Field>
        )}
        <div className="ob-test">
          <Button onClick={run} disabled={testing}>
            {testing ? <Working label="Testing" /> : test ? 'Test again' : 'Test connection'}
          </Button>
          <span className="mono muted">Writes and deletes one tiny test file.</span>
        </div>
        {test?.ok && (
          <div className="ob-result is-ok">
            <strong>✓ Connected{c.bucket ? ` to ${c.bucket}` : ''}</strong>
            <span className="mono">
              wrote and deleted .specimen-check in {test.ms} ms · read ✓ write ✓ list ✓
            </span>
          </div>
        )}
        {test && !test.ok && (
          <div className="ob-result is-bad">
            <strong>✕ {test.error?.title}</strong>
            <span>{test.error?.detail}</span>
          </div>
        )}
      </div>
      <div className="ob-actions">
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={!test?.ok} onClick={save}>
          Save and continue
        </Button>
      </div>
    </div>
  );
}

/**
 * First run: pick where boards live, confirm the folder, start a first board.
 * OAuth providers return here with `?connected=<storage id>`.
 */
export default function Onboarding() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const load = useSession((s) => s.load);
  const [step, setStep] = useState(params.get('connected') ? 2 : 1);
  const [picked, setPicked] = useState<StorageKind | null>(null);
  const [sub, setSub] = useState<'pick' | 'perm' | 'keys'>('pick');
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [all, setAll] = useState<StorageInfo[]>([]);
  const [title, setTitle] = useState('How Shazam works');
  const [template, setTemplate] = useState('');
  const [root, setRoot] = useState('/Specimen');

  useEffect(() => {
    api.storages(true).then((list) => {
      setAll(list);
      const id = params.get('connected');
      const s = list.find((x) => x.id === id) ?? null;
      if (s) {
        setStorage(s);
        setRoot(s.root);
      }
    });
    if (params.get('error')) toast('Access was not granted. Pick a storage to try again.');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (go: string) => {
    await api.finishOnboarding();
    await load();
    nav(go);
  };

  const create = async () => {
    const sid = storage?.id;
    const { storageId, board } = await api.createBoard(title || 'Untitled board', sid, template || undefined);
    await finish(`/b/${storageId}/${board.slug}`);
  };

  const continueWith = () => {
    if (!picked) return;
    if (OAUTH.includes(picked)) setSub('perm');
    else setSub('keys');
  };
  const existingLocal = all.find((s) => s.kind === 'local');

  return (
    <div className="ob">
      <header className="ob-head">
        <Logo />
        <Steps step={step} />
        <button type="button" className="ob-skip" onClick={() => finish('/boards')}>
          Skip for now
        </button>
      </header>
      <div className="ob-body">
        {step === 1 && sub === 'pick' && (
          <div className="ob-main">
            <h1 className="display">
              Where should your boards <em>live</em>?
            </h1>
            <p className="read muted">Pick a place you already own. You can add more later and choose one per board.</p>
            {GROUPS.map((g) => (
              <div key={g.label} className="ob-group">
                <Label>{g.label}</Label>
                <div className="ob-providers">
                  {g.kinds.map((k) => (
                    <button key={k} type="button" className={cx('ob-provider', picked === k && 'is-on')} onClick={() => setPicked(k)}>
                      <span className="ob-badge mono">{STORAGE_BADGE[k]}</span>
                      <span>
                        <strong>{STORAGE_NAME[k]}</strong>
                        <small>{DESC[k]}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="ob-actions">
              {existingLocal && (
                <Button
                  onClick={() => {
                    setStorage(existingLocal);
                    setStep(2);
                  }}
                >
                  Use the local folder for now
                </Button>
              )}
              <Button variant="primary" disabled={!picked} onClick={continueWith}>
                Continue{picked ? ` with ${STORAGE_NAME[picked]}` : ''}
              </Button>
            </div>
          </div>
        )}
        {step === 1 && sub === 'perm' && picked && <Permissions kind={picked} onBack={() => setSub('pick')} />}
        {step === 1 && sub === 'keys' && picked && (
          <KeyForm
            kind={picked}
            onBack={() => setSub('pick')}
            onSaved={(s) => {
              setStorage(s);
              setRoot(s.root);
              setStep(2);
            }}
          />
        )}

        {step === 2 && storage && (
          <div className="ob-main">
            <h1 className="display">
              Choose a <em>folder</em>
            </h1>
            <p className="read muted">Specimen keeps everything under one folder in your {storage.name}.</p>
            <div className="ob-form">
              <Field label="Folder">
                <div className="ob-folder">
                  <StorageBadge kind={storage.kind} />
                  <span className="mono">{storage.kind === 'gdrive' ? 'My Drive ›' : storage.name + ' ›'}</span>
                  <Input mono value={root} onChange={(e) => setRoot(e.target.value)} disabled={storage.kind === 'local'} />
                </div>
              </Field>
              <dl className="ob-facts">
                <dt>Who can see it</dt>
                <dd>Only you</dd>
                <dt>Free space</dt>
                <dd className="mono">{storage.usage?.total ? `${formatBytes(storage.usage.total - storage.usage.used)} of ${formatBytes(storage.usage.total)}` : 'No quota'}</dd>
                <dt>Media</dt>
                <dd>Kept in a /media subfolder of each board</dd>
              </dl>
            </div>
            <div className="ob-actions">
              <Button onClick={() => (setStep(1), setSub('pick'))}>Back</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (root !== storage.root && storage.kind !== 'local') setStorage(await api.updateStorage(storage.id, { root }));
                  setStep(3);
                }}
              >
                Use this folder
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="ob-main">
            <h1 className="display">
              Start your first <em>board</em>
            </h1>
            <p className="read muted">Examples add sections and cards. Delete what you don't need.</p>
            <Field label="What are you researching?">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </Field>
            <div className="ob-templates">
              {[{ slug: '', title: 'Empty board', dek: 'Paste or drop anything to start.' }, ...sampleBoards].map((t) => (
                <button key={t.slug} type="button" className={cx('ob-provider', template === t.slug && 'is-on')} onClick={() => setTemplate(t.slug)}>
                  <span className="ob-badge mono">{t.slug ? 'EX' : '∅'}</span>
                  <span>
                    <strong>{t.slug ? `Example: ${t.title}` : t.title}</strong>
                    <small>{t.dek?.slice(0, 80)}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="mono muted">
              Saves to {storage?.name ?? 'your storage'} › {root}/{slugify(title)}/
            </p>
            <div className="ob-actions">
              <Button onClick={() => setStep(2)} disabled={!storage}>
                Back
              </Button>
              <Button variant="primary" onClick={create}>
                Create board
              </Button>
            </div>
          </div>
        )}

        <aside className="ob-side">
          <Label>{step === 2 ? 'File structure · open format' : "What you'll get"}</Label>
          <Tree root={root} slug={slugify(title)} />
          <p className="muted">Open JSON and normal media files. Any tool can read them, with or without Specimen. You can leave at any time: every board is a folder you can zip, move or open in a text editor.</p>
          <p className="mono muted ob-side-note">
            <Icon name="lock" size={12} /> No database. No telemetry.
          </p>
        </aside>
      </div>
    </div>
  );
}
