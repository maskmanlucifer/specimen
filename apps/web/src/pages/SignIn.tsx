import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, GitHubMark, Input, Label, Logo } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import './auth.css';

const ERRORS: Record<string, string> = {
  'link-expired': 'That sign-in link has expired or was already used. Ask for a new one.',
  denied: 'Sign-in was cancelled.',
  state: 'Sign-in took too long. Try again.',
};

/**
 * Sign in. Hosted mode: Google, GitHub or an email link (4b). Self-hosted: one password (4c).
 * With AUTH=none there is no screen: the visitor goes straight to their boards.
 */
export default function SignIn() {
  const session = useSession((s) => s.session);
  const load = useSession((s) => s.load);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/boards';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(ERRORS[params.get('error') ?? ''] ?? '');

  useEffect(() => {
    if (session?.user) nav(session.onboarded ? next : '/onboarding', { replace: true });
  }, [session, nav, next]);
  if (!session) return null;

  const host = session.authMode === 'hosted' ? location.host : 'self-hosted';
  return (
    <div className="auth">
      <div className="auth-top">
        <Logo size={24} />
        <span className="mono muted">{host}</span>
      </div>
      <main className="auth-card">
        {session.authMode === 'password' ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.signInPassword(pw);
                await load();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <h1 className="display">
              Welcome <em>back</em>
            </h1>
            <p className="read muted">This Specimen runs on your own server, in single-user mode.</p>
            <Field label="Password">
              <div className="auth-pw">
                <Input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
                <button type="button" className="mono" onClick={() => setShow(!show)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>
            {error && <p className="auth-error">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="auth-wide">
              Unlock
            </Button>
            <div className="auth-instance">
              <Label>This instance</Label>
              <dl className="mono">
                <dt>version</dt>
                <dd>{session.version}</dd>
                <dt>storage</dt>
                <dd>{session.dataDir} (local folder)</dd>
                <dt>auth</dt>
                <dd>AUTH=password</dd>
              </dl>
              <p className="muted">
                Running alone on your laptop? Set <code>AUTH=none</code> to skip this screen. Forgot it? Reset <code>PASSWORD</code> on the server.
              </p>
            </div>
          </form>
        ) : sent ? (
          <div>
            <h1 className="display">
              Check your <em>inbox</em>
            </h1>
            <p className="read">We sent a link to {email}. It works for 15 minutes.</p>
            <Button variant="ghost" onClick={() => setSent(false)}>
              Use another email
            </Button>
          </div>
        ) : (
          <div>
            <h1 className="display">
              Sign in to <em>Specimen</em>
            </h1>
            <p className="read muted">New here? The same buttons create your account.</p>
            <div className="auth-buttons">
              <a className={`ui-btn ui-btn--secondary ui-btn--lg auth-wide${session.providers.google ? '' : ' is-off'}`} href={session.providers.google ? '/api/auth/oauth/google' : undefined} aria-disabled={!session.providers.google} title={session.providers.google ? undefined : 'Set GOOGLE_CLIENT_ID on the server'}>
                <span className="auth-g">G</span> Continue with Google
              </a>
              <a className={`ui-btn ui-btn--secondary ui-btn--lg auth-wide${session.providers.github ? '' : ' is-off'}`} href={session.providers.github ? '/api/auth/oauth/github' : undefined} aria-disabled={!session.providers.github} title={session.providers.github ? undefined : 'Set GITHUB_CLIENT_ID on the server'}>
                <GitHubMark /> Continue with GitHub
              </a>
            </div>
            <div className="auth-or mono">OR</div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api.signInEmail(email);
                  setSent(true);
                  setError('');
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </Field>
              {error && <p className="auth-error">{error}</p>}
              <Button type="submit" variant="primary" size="lg" className="auth-wide">
                Email me a sign-in link
              </Button>
            </form>
          </div>
        )}
      </main>
      <p className="auth-foot">
        <strong>Your files stay in your storage.</strong> Specimen only keeps your sign-in and the list of places you connected.
      </p>
    </div>
  );
}
