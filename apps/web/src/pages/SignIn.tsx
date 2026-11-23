import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cloudConfig } from '../backend/cloud';
import { CloudSetup } from '../components/CloudSetup';
import { Button, Logo, Working } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import './auth.css';

/** Google "G" mark, drawn inline so the page loads nothing from Google until the user clicks. */
function GoogleMark() {
  return (
    <svg className="auth-g" width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1c.9-2.8 3.5-5 6.6-5z" />
    </svg>
  );
}

/**
 * Sign in with Google through the person's own Supabase project, or keep working in this browser.
 * There is no Specimen server and no password.
 */
export default function SignIn() {
  const session = useSession((s) => s.session);
  const [params] = useSearchParams();
  const next = params.get('next') || '/boards';
  const [setup, setSetup] = useState(!cloudConfig());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!session) return null;
  const signedIn = session.authMode === 'hosted';

  return (
    <div className="auth">
      <div className="auth-top">
        <Logo size={24} />
        <span className="mono muted">{location.host}</span>
      </div>
      <main className="auth-card">
        <h1 className="display">
          {signedIn ? 'You are signed in' : <>Keep boards in your <em>Drive</em></>}
        </h1>
        <p className="read muted">{signedIn ? `Google account: ${session.user?.email}` : 'Sign in with Google to save boards in your own Google Drive and open them on any device.'}</p>
        {signedIn ? (
          <Link to={next} className="ui-btn ui-btn--primary ui-btn--lg auth-wide">
            Open your boards
          </Link>
        ) : setup ? (
          <CloudSetup onSaved={() => setSetup(false)} />
        ) : (
          <div className="auth-buttons">
            <Button
              variant="secondary"
              size="lg"
              className="auth-wide"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api.signInWithGoogle(`#${next}`);
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              {busy ? <Working label="Opening Google" /> : <><GoogleMark /> Continue with Google</>}
            </Button>
            <button type="button" className="auth-link mono" onClick={() => setSetup(true)}>
              Change Supabase project
            </button>
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}
        {!signedIn && (
          <>
            <div className="auth-or mono">or</div>
            <Link to="/boards" className="ui-btn ui-btn--ghost ui-btn--md auth-wide">
              Continue without an account
            </Link>
          </>
        )}
      </main>
      <p className="auth-foot">
        <strong>Your files stay with you.</strong> Without an account, boards live in this browser. With Google, they live in /Specimen in your Drive.
      </p>
    </div>
  );
}
