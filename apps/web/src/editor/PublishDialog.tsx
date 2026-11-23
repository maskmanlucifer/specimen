import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBytes, orderedSections, type HostInfo, type HostKind, type PublicFile } from '@specimen/schema';
import { Button, Dialog, Field, Icon, Input, Label, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { useBoard } from '../store/board';
import { toast } from '../store/toast';

const LARGE = 20 * 1024 * 1024;

const HOST_KINDS: { kind: HostKind; label: string; target: string; placeholder: string; token?: string; help: string }[] = [
  { kind: 'github', label: 'GitHub Pages', target: 'Repository', placeholder: 'owner/specimen-boards', token: 'Token (contents: write)', help: 'Commits to the gh-pages branch, one folder per board.' },
  { kind: 'netlify', label: 'Netlify', target: 'Site', placeholder: 'my-notes.netlify.app', token: 'Personal access token', help: 'Deploys all your boards on this site.' },
  { kind: 'cloudflare', label: 'Cloudflare', target: 'Account id / project', placeholder: '8f2c…e41/specimen', token: 'API token (Pages: edit)', help: 'Uses wrangler pages deploy.' },
  { kind: 'server', label: 'My server', target: 'rsync target', placeholder: 'me@host:/var/www/boards', help: 'Uses rsync over SSH with your keys.' },
  { kind: 'folder', label: 'Folder', target: 'Folder path', placeholder: '/Users/me/site/public/boards', help: 'Writes a static copy into any folder, e.g. your own site’s public/ folder.' },
];

/**
 * Publish (design 3c): where the published board lives, reading order, the files that become
 * public with a warning for heavy media, and what stays private.
 */
export function PublishDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const board = useBoard((s) => s.board)!;
  const storage = useBoard((s) => s.storage);
  const { storageId, slug, change, flush, load } = useBoard.getState();
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [files, setFiles] = useState<PublicFile[]>([]);
  const [mode, setMode] = useState<'share' | 'host'>(board.publish && board.publish.target !== 'share' ? 'host' : 'share');
  const [kind, setKind] = useState<HostKind>('github');
  const [visibility, setVisibility] = useState<'published' | 'unlisted'>(board.visibility === 'published' ? 'published' : 'unlisted');
  const [domain, setDomain] = useState('');
  const [hostForm, setHostForm] = useState({ target: '', token: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    api.hosts().then((h) => {
      setHosts(h);
      const current = h.find((x) => x.id === board.publish?.target);
      if (current) {
        setKind(current.kind);
        setDomain(current.domain ?? '');
      }
    });
    flush().then(() => api.publicFiles(storageId, slug).then(setFiles));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const host = hosts.find((h) => h.kind === kind);
  const def = HOST_KINDS.find((h) => h.kind === kind)!;
  const sections = orderedSections(board);
  const privateCount = board.cards.filter((c) => c.private).length;
  const included = files.filter((f) => !board.excludeMedia.includes(f.path));
  const total = included.reduce((a, f) => a + f.size, 0);
  const large = included.filter((f) => f.size > LARGE);

  const url = useMemo(() => {
    if (mode === 'share') return `${location.origin}/s/${storageId}/${slug}/`;
    if (domain) return `https://${domain.replace(/^https?:\/\//, '')}/${slug}/`;
    if (!host) return '';
    if (kind === 'github') return `https://${host.target.split('/')[0]}.github.io/${host.target.split('/')[1]}/${slug}/`;
    if (kind === 'netlify') return `https://${host.target.includes('.') ? host.target : `${host.target}.netlify.app`}/${slug}/`;
    if (kind === 'cloudflare') return `https://${host.target.split('/')[1]}.pages.dev/${slug}/`;
    return `${host.target.replace(/\/$/, '')}/${slug}/`;
  }, [mode, domain, host, kind, storageId, slug]);

  const moveSection = (id: string, before: string) => {
    if (id === before) return;
    const order = sections.map((s) => s.id).filter((x) => x !== id);
    order.splice(order.indexOf(before), 0, id);
    change((b) => void (b.trail = order));
  };

  const saveHost = async () => {
    try {
      const h = await api.saveHost({ kind, name: def.label, target: hostForm.target.trim(), token: hostForm.token.trim() || undefined, domain: domain || undefined });
      setHosts([...hosts.filter((x) => x.id !== h.id), h]);
      toast(`${def.label} connected`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      await flush();
      const res = await api.publish(storageId, slug, { via: mode === 'share' ? 'share' : host!.id, visibility, domain: domain || undefined });
      setResult(res.url);
      await load(storageId, slug);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    try {
      await api.unpublish(storageId, slug);
      await load(storageId, slug);
      toast('Unpublished. The board is a draft again.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result)
    return (
      <Dialog open onClose={onClose} label="Published" width={560}>
        <div className="pub pub-done">
          <Label tone="accent">Published · {visibility}</Label>
          <h2 className="display">
            It's <em>live</em>
          </h2>
          <div className="pub-url mono">{result}</div>
          <div className="pub-actions">
            <Button icon="copy" onClick={() => navigator.clipboard.writeText(result).then(() => toast('Link copied'))}>
              Copy link
            </Button>
            {/^https?:/.test(result) && (
              <Button icon="external" onClick={() => window.open(result, '_blank', 'noopener')}>
                Open
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    );

  return (
    <Dialog open onClose={onClose} label="Publish" width={720}>
      <div className="pub">
        <div className="pub-head">
          <div>
            <h2 className="display">Publish</h2>
            <div className="read pub-board">{board.title}</div>
            <div className="mono muted pub-meta">
              {board.publish ? `Published ${new Date(board.publish.at).toLocaleDateString()} → ${board.publish.url}` : 'Not published yet'} · {board.cards.length} cards · source: {storage?.name} › {storage?.root}/{slug}
            </div>
          </div>
          <button type="button" className="panel-close" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <Label>Where the published board lives</Label>
        <div className="pub-modes">
          <button type="button" className={cx('pub-mode', mode === 'share' && 'is-on')} onClick={() => setMode('share')}>
            <strong>Share links from your {storage?.name}</strong>
            <span>Simplest. This Specimen server reads the published copy from your storage and shows it to readers. Popular boards use your storage bandwidth.</span>
          </button>
          <button type="button" className={cx('pub-mode', mode === 'host' && 'is-on')} onClick={() => setMode('host')}>
            <strong>Publish a static copy to a host</strong>
            <span>Fast and durable. Specimen builds plain HTML and pushes it. Your {storage?.name} stays the source.</span>
          </button>
        </div>

        {mode === 'host' && (
          <div className="pub-host">
            <Segmented size="sm" value={kind} onChange={setKind} options={HOST_KINDS.map((h) => ({ value: h.kind, label: h.label }))} />
            {host ? (
              <div className="pub-fields">
                <Field label={def.target}>
                  <Input mono value={host.target} readOnly />
                </Field>
                <Field label="Custom domain" hint="Optional">
                  <Input mono value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="notes.example.dev" />
                </Field>
              </div>
            ) : (
              <div className="pub-fields">
                <Field label={def.target} hint={def.help}>
                  <Input mono value={hostForm.target} onChange={(e) => setHostForm({ ...hostForm, target: e.target.value })} placeholder={def.placeholder} />
                </Field>
                {def.token && (
                  <Field label={def.token} hint="Encrypted on this server; never shown again.">
                    <Input mono type="password" value={hostForm.token} onChange={(e) => setHostForm({ ...hostForm, token: e.target.value })} />
                  </Field>
                )}
                <Field label="Custom domain" hint="Optional">
                  <Input mono value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="notes.example.dev" />
                </Field>
                <Button size="sm" onClick={saveHost} disabled={!hostForm.target.trim() || (!!def.token && !hostForm.token.trim())}>
                  Connect {def.label}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="pub-row">
          <Field label="Visibility">
            <Segmented
              size="sm"
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: 'published', label: 'Public' },
                { value: 'unlisted', label: 'Unlisted' },
              ]}
            />
          </Field>
          {url && <div className="pub-url mono">{url}</div>}
        </div>

        <div className="pub-cols">
          <section>
            <div className="panel-sec-head">
              <Label>Reading order (trail)</Label>
              <button type="button" className="aed-link mono" onClick={onClose}>
                Edit on canvas
              </button>
            </div>
            <ol className="pub-trail">
              {sections.map((s, i) => (
                <li
                  key={s.id}
                  draggable
                  className={cx(dragging === s.id && 'is-dragging')}
                  onDragStart={() => setDragging(s.id)}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dragging && moveSection(dragging, s.id)}
                >
                  <Icon name="drag" size={14} />
                  <span className="mono">{i + 1}</span>
                  <span>{s.title}</span>
                  <span className="mono muted">{board.cards.filter((c) => c.sectionId === s.id && !c.private).length}</span>
                </li>
              ))}
              {!sections.length && <li className="panel-muted">Add sections on the canvas to build the story.</li>}
            </ol>
          </section>
          <section>
            <div className="panel-sec-head">
              <Label>Files that become public</Label>
              <span className="mono muted">{formatBytes(total)}</span>
            </div>
            <ul className="pub-files">
              {files.map((f) => (
                <li key={f.path} className={cx(board.excludeMedia.includes(f.path) && 'is-out')}>
                  <span className="mono">{f.path}</span>
                  <span className="mono muted">{board.excludeMedia.includes(f.path) ? 'left out' : f.missing ? 'missing' : formatBytes(f.size)}</span>
                </li>
              ))}
              {!files.length && <li className="panel-muted">No media files.</li>}
            </ul>
            {large.map((f) => (
              <div key={f.path} className="pub-warn">
                <strong>
                  {f.path.split('/').pop()} is {formatBytes(f.size)}.
                </strong>{' '}
                Readers on phones will download all of it. Link it instead, or leave it out.
                <div className="pub-warn-actions">
                  <Button size="sm" onClick={() => change((b) => void b.excludeMedia.push(f.path))}>
                    Leave it out
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const link = prompt('Link to a hosted copy (YouTube, Vimeo or a file URL)');
                      if (!link) return;
                      change((b) => {
                        for (const c of b.cards) if ('src' in c && c.src === f.path) c.src = link;
                      });
                      setFiles(files.filter((x) => x.path !== f.path));
                    }}
                  >
                    Link instead
                  </Button>
                </div>
              </div>
            ))}
            {board.excludeMedia.length > 0 && (
              <button type="button" className="aed-link mono" onClick={() => change((b) => void (b.excludeMedia = []))}>
                Include left-out files again
              </button>
            )}
          </section>
        </div>

        <p className="pub-private">
          <Icon name="lock" size={14} /> {privateCount} card{privateCount === 1 ? '' : 's'} marked private stay private. Your {storage?.name}{storage?.name.toLowerCase().endsWith('folder') ? '' : ' folder'} is never made public.
        </p>

        <div className="pub-foot">
          <Button variant="danger" size="sm" disabled={!board.publish || busy} onClick={unpublish} title={board.publish ? undefined : 'Available after publishing'}>
            Unpublish
          </Button>
          <div className="pub-foot-r">
            <Button onClick={() => nav(`/b/${storageId}/${slug}/preview`)}>Preview as reader</Button>
            <Button variant="primary" onClick={publish} disabled={busy || (mode === 'host' && !host)}>
              {busy ? 'Publishing…' : mode === 'share' ? 'Publish share link' : `Publish to ${def.label}`}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
