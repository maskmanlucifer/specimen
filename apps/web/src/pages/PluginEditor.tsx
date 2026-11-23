import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PluginManifest, settingsWithDefaults, type PluginBundle, type PluginSetting } from '@specimen/schema';
import { PluginFrame, StepBar, useSteps, type GuestMessage } from '@specimen/story';
import { Button, Field, Icon, Kbd, Label, Segmented, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { invalidatePlugin } from '../lib/plugins';
import { useTheme } from '../lib/theme';
import { useSession } from '../store/session';
import { toast } from '../store/toast';
import './plugins.css';

type FileName = 'plugin.json' | 'figure.js' | 'style.css' | 'README.md';

const STARTER: Record<FileName, string> = {
  'plugin.json': JSON.stringify(
    {
      id: 'ripple-tank-2',
      name: 'Ripple tank',
      version: '0.1.0',
      description: 'Two point sources and their interference pattern.',
      author: 'you',
      license: 'MIT',
      category: 'figures',
      permissions: [],
      inputs: [],
      settings: [
        { type: 'range', key: 'wavelength', label: 'Wavelength', min: 10, max: 60, step: 1, unit: 'px', default: 26 },
        { type: 'boolean', key: 'nodes', label: 'Show nodes', default: false },
      ],
      stepped: false,
      height: 240,
    },
    null,
    2,
  ),
  'figure.js': `// Runs in a sandbox: no network, no storage, no cookies.
// specimen.render() is called with the settings from the side panel.
specimen.render(({ root, settings, width, height }) => {
  const k = (2 * Math.PI) / settings.wavelength;
  const a = { x: width * 0.42, y: height / 2 }, b = { x: width * 0.58, y: height / 2 };
  let dots = '', n = 0;
  for (let y = 5; y < height; y += 10) for (let x = 5; x < width; x += 10) {
    const v = (Math.cos(k * Math.hypot(x - a.x, y - a.y)) + Math.cos(k * Math.hypot(x - b.x, y - b.y))) / 2;
    const node = settings.nodes && Math.abs(v) < 0.08;
    dots += \`<circle cx="\${x}" cy="\${y}" r="\${node ? 1.5 : (v + 1) * 2}" class="\${node ? 'node' : 'dot'}"/>\`;
    n++;
  }
  root.innerHTML = \`<svg width="\${width}" height="\${height}">\${dots}</svg>\`;
  console.log('Rendered', n, 'dots');
});
`,
  'style.css': `svg { display: block; }
.dot { fill: var(--ink); }
.node { fill: var(--hot); }
`,
  'README.md': '# Ripple tank\n\nTwo coherent point sources.\n',
};

const LANG: Record<FileName, () => ReturnType<typeof javascript>> = {
  'plugin.json': json as unknown as () => ReturnType<typeof javascript>,
  'figure.js': javascript,
  'style.css': css as unknown as () => ReturnType<typeof javascript>,
  'README.md': markdown as unknown as () => ReturnType<typeof javascript>,
};

/** CodeMirror 6 editor for one file. Reports cursor position for the status bar. */
function Code({ value, file, onChange, onCursor, onRun }: { value: string; file: FileName; onChange: (v: string) => void; onCursor: (ln: number, col: number) => void; onRun: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onChange, onCursor, onRun });
  cbs.current = { onChange, onCursor, onRun };
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          LANG[file](),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cbs.current.onChange(u.state.doc.toString());
            const pos = u.state.selection.main.head;
            const line = u.state.doc.lineAt(pos);
            cbs.current.onCursor(line.number, pos - line.from + 1);
          }),
          EditorView.domEventHandlers({
            keydown: (e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                cbs.current.onRun();
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={host} className="pe-code" />;
}

function SettingInput({ s, value, onChange }: { s: PluginSetting; value: unknown; onChange: (v: unknown) => void }) {
  if (s.type === 'range')
    return (
      <div className="panel-range">
        <input type="range" min={s.min} max={s.max} step={s.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="mono">
          {String(value)} {s.unit}
        </span>
      </div>
    );
  if (s.type === 'boolean') return <Toggle checked={!!value} onChange={onChange} label={s.label} />;
  if (s.type === 'select') return <Segmented size="sm" value={String(value)} onChange={(v) => onChange(typeof s.options[0] === 'number' ? Number(v) : v)} options={s.options.map((o) => ({ value: String(o), label: String(o) }))} />;
  return <input className="ui-input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
}

/**
 * Make a plugin (3b): files on the left, code in the middle, a sandboxed live preview with
 * schema-generated settings and a console on the right. Saves to `<storage>/plugins/<id>/`.
 */
export default function PluginEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { theme } = useTheme();
  const storage = useSession((s) => s.session?.dataDir);
  const [files, setFiles] = useState<Record<FileName, string> | null>(id ? null : STARTER);
  const [file, setFile] = useState<FileName>('figure.js');
  const [cursor, setCursor] = useState([1, 1]);
  const [running, setRunning] = useState<PluginBundle | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [logs, setLogs] = useState<{ level: string; text: string }[]>([]);
  const steps = useSteps();

  useEffect(() => {
    if (!id) return;
    api.plugin(id).then((b) => setFiles({ 'plugin.json': JSON.stringify(b.manifest, null, 2), 'figure.js': b.script, 'style.css': b.style, 'README.md': b.readme ?? '' }), () => toast('Plugin not found'));
  }, [id]);

  const parsed = useMemo(() => {
    if (!files) return null;
    try {
      return { manifest: PluginManifest.parse(JSON.parse(files['plugin.json'])), error: null };
    } catch (e) {
      return { manifest: null, error: (e as Error).message.split('\n')[0] };
    }
  }, [files]);

  const run = () => {
    if (!files || !parsed?.manifest) return;
    setLogs([{ level: 'ok', text: `Loaded plugin.json · schema valid · ${parsed.manifest.settings.length} settings` }]);
    setRunning({ manifest: parsed.manifest, script: files['figure.js'], style: files['style.css'], readme: files['README.md'] });
  };
  useEffect(() => {
    if (files && !running) run();
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!files || !parsed?.manifest) return toast(parsed?.error ?? 'Fix plugin.json first');
    try {
      await api.savePlugin({ manifest: parsed.manifest, script: files['figure.js'], style: files['style.css'], readme: files['README.md'] });
      invalidatePlugin(parsed.manifest.id);
      toast(`Saved ${parsed.manifest.name} to your plugins folder`);
      if (!id) nav(`/plugins/${parsed.manifest.id}/edit`, { replace: true });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (!files) return null;
  const m = running?.manifest;
  const values = m ? settingsWithDefaults(m, settings) : {};

  return (
    <div className="pe">
      <header className="pe-head">
        <Link to="/plugins" className="bbar-back" aria-label="Back to plugins">
          <Icon name="back" />
        </Link>
        <div>
          <h1 className="read">{parsed?.manifest?.name ?? 'Untitled plugin'}</h1>
          <span className="mono muted">
            Make a plugin · draft · /Specimen/plugins/{parsed?.manifest?.id ?? '…'}/
          </span>
        </div>
        <div className="pe-head-r">
          <Button icon="play" onClick={run}>
            Run <Kbd>⌘↵</Kbd>
          </Button>
          <Button onClick={() => save().then(() => nav('/boards'))}>Try on a board</Button>
          <Button variant="primary" onClick={save}>
            Save to library
          </Button>
        </div>
      </header>
      <div className="pe-body">
        <aside className="pe-files">
          <Label>{(parsed?.manifest?.id ?? 'plugin').toUpperCase()}/</Label>
          {(Object.keys(STARTER) as FileName[]).map((f) => (
            <button key={f} type="button" className={cx(file === f && 'is-on')} onClick={() => setFile(f)}>
              <Icon name="doc" size={14} /> {f}
            </button>
          ))}
          <p className="muted">Plain HTML, JS and SVG. No build step.</p>
          <a className="mono" href="https://github.com/specimen-dev/specimen/blob/main/docs/plugins.md" target="_blank" rel="noreferrer">
            Plugin API docs ↗
          </a>
        </aside>
        <section className="pe-editor">
          <div className="pe-tab mono">{file}</div>
          <Code key={file} file={file} value={files[file]} onChange={(v) => setFiles({ ...files, [file]: v })} onCursor={(l, c) => setCursor([l, c])} onRun={run} />
          <div className="pe-status mono">
            <span>
              Ln {cursor[0]}, Col {cursor[1]}
            </span>
            <span>{file.endsWith('.js') ? 'JavaScript' : file.endsWith('.css') ? 'CSS' : file.endsWith('.json') ? 'JSON' : 'Markdown'}</span>
            <span className={parsed?.error ? 'tone-hot' : 'tone-accent'}>{parsed?.error ? `✕ ${parsed.error}` : '✓ No errors'}</span>
          </div>
        </section>
        <aside className="pe-preview">
          <div className="pe-badges">
            <Label>Sandboxed preview</Label>
            <span className="mono">no network</span>
            <span className="mono">no storage</span>
            <span className="mono">no cookies</span>
          </div>
          <div className="panel-fig">
            <div className="card-fig-head">
              <span className="sp-label">Fig. — {m?.name}</span>
            </div>
            {running && (
              <PluginFrame
                bundle={running}
                settings={settings}
                step={steps.step}
                playing={steps.playing}
                theme={theme}
                onSteps={steps.setSteps}
                onStep={steps.setStep}
                onLog={(l) => setLogs((x) => [...x.slice(-80), { level: l.type === 'error' ? 'error' : (l as Extract<GuestMessage, { type: 'log' }>).level, text: l.text }])}
              />
            )}
            {m?.stepped && steps.steps > 1 && <StepBar step={steps.step} steps={steps.steps} playing={steps.playing} onStep={steps.setStep} onPlay={steps.setPlaying} />}
          </div>
          <Label>Settings, generated from your schema</Label>
          <div className="pe-settings">
            {m?.settings.map((s) => (
              <Field key={s.key} label={s.label}>
                <SettingInput s={s} value={values[s.key]} onChange={(v) => setSettings({ ...settings, [s.key]: v })} />
              </Field>
            ))}
          </div>
          <div className="pe-console-head">
            <Label>Console</Label>
            <button type="button" className="aed-link mono" onClick={() => setLogs([])}>
              Clear
            </button>
          </div>
          <ul className="pe-console mono">
            {logs.map((l, i) => (
              <li key={i} className={`is-${l.level}`}>
                <span>{l.level === 'error' ? '✕' : l.level === 'warn' ? '!' : '✓'}</span>
                {l.text}
              </li>
            ))}
            <li className="muted">› permissions: {m?.permissions.length ? m.permissions.join(', ') : 'none requested'}</li>
            <li className="muted">› saves to {storage ? 'your default storage' : 'storage'} under plugins/</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
