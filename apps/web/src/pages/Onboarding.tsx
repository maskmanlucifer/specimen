import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sampleBoards, slugify, STORAGE_BADGE } from '@specimen/schema';
import { cloudConfig } from '../backend/cloud';
import { CloudSetup } from '../components/CloudSetup';
import { Button, Field, Icon, Input, Label, Logo, Working } from '../components/ui';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { useSession } from '../store/session';
import { toast } from '../store/toast';
import './onboarding.css';

function Steps({ step }: { step: number }) {
  return (
    <ol className="ob-steps">
      {['Where boards live', 'First board'].map((s, i) => (
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
    board.json  `}
      <span>cards, positions, links</span>
      {`
    media/clip-01.mp3
    plugins/    `}
      <span>pinned versions</span>
      {`
    published/  `}
      <span>static copies</span>
    </pre>
  );
}

/** Explains the Google permission in plain words before leaving for Google (4f). */
function Permissions({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="ob-main">
      <h1 className="display">
        Before you go to <em>Google</em>
      </h1>
      <p className="read muted">Google will ask you to allow access. Here is exactly what that means, in plain words.</p>
      <div className="ob-perm">
        <Label tone="accent">Specimen can</Label>
        <ul>
          <li>✓ See and change only the files it creates, inside /Specimen in your Drive</li>
          <li>✓ Make share links for boards you publish, when you ask</li>
        </ul>
        <Label tone="hot">Specimen cannot</Label>
        <ul>
          <li>✕ See your other files, photos or documents</li>
          <li>✕ Delete anything outside its own folder</li>
          <li>✕ Keep a copy of your files anywhere else</li>
        </ul>
        <p className="mono muted">Scope requested: drive.file · Revoke any time at myaccount.google.com/permissions</p>
      </div>
      <p className="ob-note">
        <Icon name="alert" size={14} />
        <span>
          On Google’s screen, <strong>tick the Google Drive box</strong> (“See, edit, create, and delete only the specific Google Drive files you use with this app”). It starts unticked, and Specimen cannot save without it.
        </span>
      </p>
      <div className="ob-actions">
        <Button onClick={onBack}>Back</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.signInWithGoogle('#/onboarding?step=2');
            } catch (e) {
              toast((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? <Working label="Opening Google" /> : 'Continue with Google'}
        </Button>
      </div>
    </div>
  );
}

/**
 * First run: choose where boards live (this browser, or Google Drive through the user's own
 * Supabase project), then start a first board. Google returns here with `?step=2`.
 */
export default function Onboarding() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const load = useSession((s) => s.load);
  const session = useSession((s) => s.session);
  const signedIn = session?.authMode === 'hosted';
  const [step, setStep] = useState(params.get('step') === '2' ? 2 : 1);
  const [picked, setPicked] = useState<'local' | 'gdrive'>(signedIn ? 'gdrive' : 'local');
  const [sub, setSub] = useState<'pick' | 'setup' | 'perm'>('pick');
  const [title, setTitle] = useState('How Shazam works');
  const [template, setTemplate] = useState('');
  const storageId = signedIn && picked === 'gdrive' ? 'gdrive' : 'local';
  const root = storageId === 'gdrive' ? 'My Drive/Specimen' : 'This browser';

  useEffect(() => {
    if (signedIn) setPicked('gdrive');
  }, [signedIn]);

  const finish = async (go: string) => {
    await api.finishOnboarding();
    await load();
    nav(go);
  };

  const create = async () => {
    const { storageId: sid, board } = await api.createBoard(title || 'Untitled board', storageId, template || undefined);
    await finish(`/b/${sid}/${board.slug}`);
  };

  const continueWith = () => {
    if (picked === 'local' || signedIn) return setStep(2);
    setSub(cloudConfig() ? 'perm' : 'setup');
  };

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
            <p className="read muted">Start without an account, or keep boards in your own Google Drive. You can move a board later.</p>
            <div className="ob-providers">
              <button type="button" className={cx('ob-provider', picked === 'local' && 'is-on')} onClick={() => setPicked('local')}>
                <span className="ob-badge mono">{STORAGE_BADGE.local}</span>
                <span>
                  <strong>This browser</strong>
                  <small>No account. Data stays on this device; export it any time.</small>
                </span>
              </button>
              <button type="button" className={cx('ob-provider', picked === 'gdrive' && 'is-on')} onClick={() => setPicked('gdrive')}>
                <span className="ob-badge mono">{STORAGE_BADGE.gdrive}</span>
                <span>
                  <strong>Google Drive</strong>
                  <small>{signedIn ? `Signed in as ${session?.user?.email}` : 'Sign in with Google. Uses your own Supabase project.'}</small>
                </span>
              </button>
            </div>
            {picked === 'local' && (
              <p className="ob-note">
                <Icon name="alert" size={14} />
                <span>
                  Boards in this browser are lost if you clear site data or use a private window. Use <strong>Settings → Import / Export</strong> to download a backup.
                </span>
              </p>
            )}
            <div className="ob-actions">
              <Button variant="primary" onClick={continueWith}>
                {picked === 'local' ? 'Use this browser' : signedIn ? 'Use Google Drive' : 'Continue with Google Drive'}
              </Button>
            </div>
          </div>
        )}
        {step === 1 && sub === 'setup' && (
          <div className="ob-main">
            <h1 className="display">
              Connect your <em>Supabase</em>
            </h1>
            <p className="read muted">Specimen has no server of its own. Your Supabase project signs you in with Google and keeps the Drive key safe.</p>
            <CloudSetup onCancel={() => setSub('pick')} onSaved={() => setSub('perm')} />
          </div>
        )}
        {step === 1 && sub === 'perm' && <Permissions onBack={() => setSub('pick')} />}

        {step === 2 && (
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
              Saves to {root} › {slugify(title)}/
            </p>
            <div className="ob-actions">
              <Button onClick={() => (setStep(1), setSub('pick'))}>Back</Button>
              <Button variant="primary" onClick={create}>
                Create board
              </Button>
            </div>
          </div>
        )}

        <aside className="ob-side">
          <Label>What you'll get</Label>
          <Tree root={storageId === 'gdrive' ? '/Specimen' : 'This browser'} slug={slugify(title)} />
          <p className="muted">Open JSON and normal media files. Any tool can read them, with or without Specimen. Every board is a folder you can export as a zip and take anywhere.</p>
          <p className="mono muted ob-side-note">
            <Icon name="lock" size={12} /> No Specimen server. No telemetry.
          </p>
        </aside>
      </div>
    </div>
  );
}
