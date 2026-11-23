import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sampleBoards, type PluginBundle } from '@specimen/schema';
import { PluginFrame, Story, StoryEnvContext, type StoryTab } from '@specimen/story';
import { GitHubMark, Label, Logo, Segmented } from '../components/ui';
import { useTheme } from '../lib/theme';
import { useSession } from '../store/session';
import './landing.css';

const REPO = 'https://github.com/specimen-dev/specimen';
const DEMO = sampleBoards.find((b) => b.slug === 'how-compression-works')!;
const SHOWCASE = [
  { id: 'spectrogram-viewer', settings: {}, label: 'Spectrogram viewer', use: 'How Shazam works' },
  { id: 'tree-builder', settings: {}, label: 'Tree builder', use: 'How compression works' },
  { id: 'ripple-tank', settings: { nodes: true }, label: 'Ripple tank', use: 'Why the sky is blue' },
  { id: 'step-animator', settings: { preset: 'sliding-window' }, label: 'Step-through animator', use: 'LZ77, step by step' },
];

/** Built-in plugins, fetched without sign-in for the public demo. */
function usePublicPlugins(ids: string[]) {
  const [out, setOut] = useState<Record<string, PluginBundle>>({});
  useEffect(() => {
    Promise.all(ids.map((id) => fetch(`/api/public/plugins/${id}`).then((r) => (r.ok ? r.json() : null)))).then((list) => setOut(Object.fromEntries(list.filter(Boolean).map((b: PluginBundle) => [b.manifest.id, b]))));
  }, [ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

/** Public landing page (4a): the pitch, a live Board/Story demo, storage, plugins and self-hosting. */
export default function Landing() {
  const user = useSession((s) => s.session?.user);
  const { theme } = useTheme();
  const [tab, setTab] = useState<StoryTab>('story');
  const plugins = usePublicPlugins(['tree-builder', ...SHOWCASE.map((s) => s.id)]);
  const start = user ? '/boards' : '/signin';

  return (
    <div className="ld">
      <header className="ld-nav">
        <Logo size={26} />
        <nav>
          <a href="#demo">Examples</a>
          <a href="#plugins">Plugins</a>
          <a href={`${REPO}#readme`}>Docs</a>
          <a href="#self-host">Self-host</a>
        </nav>
        <a className="ui-btn ui-btn--secondary ui-btn--md ld-gh" href={REPO}>
          <GitHubMark /> GitHub
        </a>
        {!user && (
          <Link to="/signin" className="ld-signin">
            Sign in
          </Link>
        )}
        <Link to={start} className="ui-btn ui-btn--primary ui-btn--md">
          {user ? 'Your boards' : 'Start a board'}
        </Link>
      </header>

      <section className="ld-hero">
        <div>
          <Label tone="accent">Open source · bring your own storage</Label>
          <h1 className="display">
            Collect what you learn. Publish it as an <em>explanation</em>.
          </h1>
        </div>
        <div className="ld-hero-r">
          <p className="read">Specimen is a research board for one topic at a time. Paste notes, sources, photos, audio and code. Connect what relates. Then publish it as a calm, illustrated page anyone can read and play with.</p>
          <div className="ld-ctas">
            <Link to={start} className="ui-btn ui-btn--primary ui-btn--lg">
              Start a board, free
            </Link>
            <a href="#self-host" className="ui-btn ui-btn--secondary ui-btn--lg">
              Self-host in 5 minutes
            </a>
          </div>
          <p className="ld-note">Your files stay in your Google Drive, Dropbox, S3 or folder.</p>
        </div>
      </section>

      <section id="demo" className="ld-demo">
        <div className="ld-demo-bar">
          <Label>Live demo · how compression works</Label>
          <Segmented
            size="sm"
            value={tab === 'board' ? 'board' : 'story'}
            onChange={(v) => setTab(v as StoryTab)}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'story', label: 'Story' },
            ]}
          />
        </div>
        <div className="ld-demo-frame">
          <StoryEnvContext.Provider value={{ mediaUrl: (p) => p, plugins, theme }}>
            <Story board={DEMO} tab={tab} onTab={setTab} />
          </StoryEnvContext.Provider>
        </div>
        <p className="ld-caption read">The same board, two views. You edit the canvas; readers get the story.</p>
      </section>

      <section className="ld-sec ld-storage">
        <div>
          <Label tone="accent">Bring your own storage</Label>
          <h2 className="display">
            Your files never <em>leave</em> you
          </h2>
          <p className="read">Specimen is only the editor and the viewer. Boards are open files in a folder you own, so you can leave any time.</p>
        </div>
        <ol className="ld-steps">
          <li>
            <span className="mono">01</span>
            <strong>Connect storage</strong>
            <p>Google Drive, Dropbox, OneDrive, any S3 bucket, WebDAV or a local folder. Specimen sees only its own folder.</p>
          </li>
          <li>
            <span className="mono">02</span>
            <strong>Work in plain files</strong>
            <pre className="mono">{'/Specimen/how-shazam-works/\n  board.json\n  media/clip-01.mp3\n  plugins/'}</pre>
          </li>
          <li>
            <span className="mono">03</span>
            <strong>Publish where you like</strong>
            <p>Share links from your storage, or push a static copy to GitHub Pages, Netlify, Cloudflare Pages or your own server.</p>
          </li>
        </ol>
      </section>

      <section id="plugins" className="ld-sec">
        <div className="ld-sec-head">
          <div>
            <Label tone="accent">Plugins</Label>
            <h2 className="display">
              Figures readers can <em>play</em> with
            </h2>
          </div>
          <Link to={user ? '/plugins' : '/signin'} className="mono">
            Browse plugins →
          </Link>
        </div>
        <div className="ld-plugins">
          {SHOWCASE.map((s) => (
            <figure key={s.id} className="ld-plugin">
              <div className="ld-plugin-fig">{plugins[s.id] && <PluginFrame bundle={plugins[s.id]} settings={s.settings} theme={theme} height={170} />}</div>
              <figcaption>
                <strong>{s.label}</strong>
                <span className="mono muted">{s.use}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="ld-sec ld-open">
        <div>
          <Label tone="accent">Open source</Label>
          <h2 className="display">
            Small core, <em>open</em> edges
          </h2>
          <p className="read">MIT licensed. Twelve built-in card types, everything else is a plugin. Run it on a $5 server or your laptop.</p>
          <div className="ld-ctas">
            <a className="ui-btn ui-btn--secondary ui-btn--md" href={REPO}>
              <GitHubMark /> View on GitHub
            </a>
            <a className="ui-btn ui-btn--ghost ui-btn--md" href="#self-host">
              Self-host guide
            </a>
          </div>
        </div>
        <div id="self-host" className="ld-code">
          <Label>Self-host in 5 minutes</Label>
          <pre className="mono">{`# 1. run it
docker run -p 3000:3000 \\
  -v ./specimen:/data \\
  ghcr.io/specimen-dev/specimen:latest

# 2. open http://localhost:3000
# 3. choose: single user, password, or no login`}</pre>
          <ul className="mono">
            <li>✓ No database required</li>
            <li>✓ No telemetry</li>
            <li>✓ Works offline</li>
          </ul>
        </div>
      </section>

      <footer className="ld-foot">
        <Logo size={20} />
        <nav className="mono">
          <a href={`${REPO}#readme`}>Docs</a>
          <a href="#plugins">Plugins</a>
          <a href={REPO}>GitHub</a>
          <a href={`${REPO}/releases`}>Changelog</a>
        </nav>
        <span className="mono muted">MIT · made by people who like footnotes</span>
      </footer>
    </div>
  );
}
