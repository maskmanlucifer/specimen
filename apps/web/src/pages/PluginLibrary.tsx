import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { InstalledPlugin, PluginBundle, PluginSetting } from '@specimen/schema';
import { PluginFrame } from '@specimen/story';
import { AppHeader } from '../components/AppHeader';
import { Button, Icon, Input, Label, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { loadPlugin } from '../lib/plugins';
import { useTheme } from '../lib/theme';
import './plugins.css';

type Cat = 'all' | 'figures' | 'audio' | 'data' | 'math';

function describeSetting(s: PluginSetting): string {
  if (s.type === 'select') return `${s.label}: ${s.options.join(' / ')}`;
  if (s.type === 'range') return `${s.label}: ${s.min}–${s.max}${s.unit ? ` ${s.unit}` : ''}`;
  if (s.type === 'boolean') return `${s.label}: on / off`;
  return `${s.label}: text`;
}

/** Small live, non-interactive preview of a plugin with its default settings. */
function Preview({ id }: { id: string }) {
  const { theme } = useTheme();
  const [b, setB] = useState<PluginBundle | null>(null);
  useEffect(() => {
    loadPlugin(id).then(setB);
  }, [id]);
  return <div className="pl-preview">{b ? <PluginFrame bundle={b} settings={{}} theme={theme} height={150} interactive={false} /> : null}</div>;
}

/**
 * Plugin library (3a). Each plugin is a card type; published, it becomes a numbered figure.
 * "Same plugin, different data" shows where a plugin is reused.
 */
export default function PluginLibrary() {
  const nav = useNavigate();
  const [list, setList] = useState<InstalledPlugin[]>([]);
  const [cat, setCat] = useState<Cat>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    api.plugins().then((l) => {
      setList(l);
      setSel(l.find((p) => p.manifest.id === 'step-animator')?.manifest.id ?? l[0]?.manifest.id ?? null);
    });
  }, []);
  const shown = useMemo(() => list.filter((p) => (cat === 'all' || p.manifest.category === cat) && `${p.manifest.name} ${p.manifest.description}`.toLowerCase().includes(q.toLowerCase())), [list, cat, q]);
  const s = list.find((p) => p.manifest.id === sel);
  const count = (c: Cat) => list.filter((p) => c === 'all' || p.manifest.category === c).length;

  return (
    <div>
      <AppHeader />
      <div className="page pl">
        <main>
          <div className="pl-head">
            <div>
              <h1 className="display">
                Plugins <em>extend</em> the board
              </h1>
              <p className="read muted">Each plugin is a card type. In edit mode it shows a live preview. Published, it becomes a numbered figure readers can play with.</p>
            </div>
            <Button variant="primary" icon="plus" onClick={() => nav('/plugins/new')}>
              Make a plugin
            </Button>
          </div>
          <div className="pl-tools">
            <Segmented
              value={cat}
              onChange={setCat}
              options={(['all', 'figures', 'audio', 'data', 'math'] as Cat[]).map((c) => ({ value: c, label: `${c[0].toUpperCase() + c.slice(1)} ${count(c)}` }))}
            />
            <div className="pl-search">
              <Icon name="search" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${list.length} plugins`} />
            </div>
          </div>
          <div className="pl-grid">
            {shown.map((p) => (
              <button key={p.manifest.id} type="button" className={cx('pl-card', sel === p.manifest.id && 'is-on')} onClick={() => setSel(p.manifest.id)}>
                <Preview id={p.manifest.id} />
                <div className="pl-card-body">
                  <div className="pl-card-row">
                    <strong>{p.manifest.name}</strong>
                    <span className="ui-pill">{p.builtIn ? 'built in' : 'yours'}</span>
                  </div>
                  <p>{p.manifest.description}</p>
                  <div className="pl-card-row mono muted">
                    <span>{p.manifest.author}</span>
                    <span>{p.manifest.permissions.length ? 'reads inputs' : 'no access'}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </main>
        {s && (
          <aside className="pl-detail">
            <span className="ob-badge mono">{s.manifest.category.slice(0, 3).toUpperCase()}</span>
            <h2 className="read">{s.manifest.name}</h2>
            <span className="mono muted">
              v{s.manifest.version} · {s.manifest.author} · {s.manifest.license}
            </span>
            <div className="pl-detail-actions">
              <Button variant="primary" disabled>
                Installed
              </Button>
              <Link className="ui-btn ui-btn--secondary ui-btn--md" to={`/plugins/${s.manifest.id}/edit`}>
                {s.builtIn ? 'View source' : 'Edit'}
              </Link>
            </div>
            <p className="read">{s.manifest.long ?? s.manifest.description}</p>
            <Label>Same plugin, different data</Label>
            <ul className="pl-uses">
              {s.usedIn.map((u, i) => (
                <li key={i}>
                  <strong>{u.title}</strong>
                  <span className="muted">{u.caption ?? '—'}</span>
                </li>
              ))}
              {!s.usedIn.length && <li className="muted">Not used in any board yet.</li>}
            </ul>
            <Label>What it can access</Label>
            <ul className="pl-perm">
              <li>{s.manifest.permissions.includes('read-inputs') ? '✓ Reads the cards you link to it' : '✕ Reads no cards'}</li>
              <li>✕ No network: the sandbox blocks every request</li>
              <li>✕ No cookies, storage or access to the page</li>
            </ul>
            <Label>Settings it adds to the side panel</Label>
            <ul className="pl-perm mono">
              {s.manifest.inputs.map((i) => (
                <li key={i.key}>
                  {i.label}: {i.accepts.join(' / ')} card
                </li>
              ))}
              {s.manifest.settings.map((x) => (
                <li key={x.key}>{describeSetting(x)}</li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
