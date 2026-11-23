import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBytes, orderedSections, type PublicFile } from '@specimen/schema';
import { Button, Dialog, Field, Icon, Label, Segmented, Working } from '../components/ui';
import { api } from '../lib/api';
import { cx, boardPlace } from '../lib/format';
import { useBoard } from '../store/board';
import { toast } from '../store/toast';

const LARGE = 20 * 1024 * 1024;


/**
 * Publish (design 3c): where the published board lives, reading order, the files that become
 * public with a warning for heavy media, and what stays private.
 */
export function PublishDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const board = useBoard((s) => s.board)!;
  const storage = useBoard((s) => s.storage);
  const { storageId, slug, change, flush, load } = useBoard.getState();
  const [files, setFiles] = useState<PublicFile[]>([]);
  const onDrive = storageId === 'gdrive';
  const [mode, setMode] = useState<'share' | 'folder'>(onDrive && board.publish?.target !== 'folder' ? 'share' : 'folder');
  const [visibility, setVisibility] = useState<'published' | 'unlisted'>(board.visibility === 'published' ? 'published' : 'unlisted');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    flush().then(() => api.publicFiles(storageId, slug).then(setFiles));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = orderedSections(board);
  const privateCount = board.cards.filter((c) => c.private).length;
  const included = files.filter((f) => !board.excludeMedia.includes(f.path));
  const total = included.reduce((a, f) => a + f.size, 0);
  const large = included.filter((f) => f.size > LARGE);

  const url = mode === 'share' ? (board.publish?.target === 'share' ? board.publish.url : 'A Google Drive link, made when you publish') : `Downloads ${slug}-site.zip`;

  const moveSection = (id: string, before: string) => {
    if (id === before) return;
    const order = sections.map((s) => s.id).filter((x) => x !== id);
    order.splice(order.indexOf(before), 0, id);
    change((b) => void (b.trail = order));
  };

  const publish = async (vis: 'published' | 'unlisted' = visibility) => {
    setBusy(true);
    try {
      await flush();
      const res = await api.publish(storageId, slug, { via: mode, visibility: vis });
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

  if (result && mode === 'folder')
    return (
      <Dialog open onClose={onClose} label="Static site downloaded" width={560}>
        <div className="pub pub-done">
          <Label tone="accent">Static site</Label>
          <h2 className="display">
            Site <em>downloaded</em>
          </h2>
          <p className="muted">
            Unzip <span className="mono">{slug}-site.zip</span>. The <span className="mono">{slug}/</span> folder is the whole page: open its index.html, or copy the folder into any static host, such as your GitHub Pages repo.
          </p>
          <div className="pub-actions">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    );

  if (result)
    return (
      <Dialog open onClose={onClose} label="Published" width={560}>
        <div className="pub pub-done">
          <Label tone="accent">Published</Label>
          <h2 className="display">
            It's <em>live</em>
          </h2>
          <p className="muted">Anyone with the link can read it{visibility === 'published' ? ', and it is listed on your profile' : ''}.</p>
          <div className="pub-share">
            <Icon name="link" size={15} />
            <span className="mono pub-share-url" title={result}>
              {result}
            </span>
            <button type="button" className="pub-share-copy" onClick={() => navigator.clipboard.writeText(result).then(() => toast('Link copied'))}>
              Copy
            </button>
            <select
              className="pub-share-vis"
              value={visibility}
              aria-label="Who can find it"
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value as 'published' | 'unlisted';
                setVisibility(v);
                publish(v);
              }}
            >
              <option value="unlisted">Anyone with link</option>
              <option value="published">Public, listed</option>
            </select>
          </div>
          <div className="pub-actions">
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
              {board.publish ? `Published ${new Date(board.publish.at).toLocaleDateString()} → ${board.publish.url}` : 'Not published yet'} · {board.cards.length} cards · source: {storage?.name} › {boardPlace(storage, slug)}
            </div>
          </div>
          <button type="button" className="panel-close" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <Label>Where the published board lives</Label>
        <div className="pub-modes">
          <button type="button" className={cx('pub-mode', mode === 'share' && 'is-on')} onClick={() => setMode('share')} disabled={!onDrive}>
            <strong>Share link</strong>
            <span>Readers open a link, no sign-in. The public copy lives in your Google Drive, in this board's published/ folder.</span>
          </button>
          <button type="button" className={cx('pub-mode', mode === 'folder' && 'is-on')} onClick={() => setMode('folder')}>
            <strong>Download a static site</strong>
            <span>A zip of plain HTML, JS and media. Put the folder on any host, for example a GitHub Pages repo.</span>
          </button>
        </div>
        {!onDrive && (
          <p className="pub-note">
            <Icon name="alert" size={14} /> Share links need the board in Google Drive. This board is in {storage?.name ?? 'this browser'}.{' '}
            <button
              type="button"
              className="aed-link"
              disabled={busy}
              onClick={async () => {
                const session = await api.session();
                if (session.authMode !== 'hosted') return nav('/signin?next=' + encodeURIComponent(`/b/${storageId}/${slug}`));
                setBusy(true);
                try {
                  await flush();
                  const r = await api.moveBoard(storageId, slug, 'gdrive');
                  toast('Moved to Google Drive');
                  onClose();
                  nav(`/b/gdrive/${r.board.slug}`);
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Move it to Google Drive
            </button>
          </p>
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
          <Icon name="lock" size={14} /> {privateCount} card{privateCount === 1 ? '' : 's'} marked private stay private. {storage?.kind === 'local' ? 'Nothing else in this browser' : `The rest of your ${storage?.name ?? 'storage'}`} is ever made public.
        </p>

        <div className="pub-foot">
          <Button variant="danger" size="sm" disabled={!board.publish || busy} onClick={unpublish} title={board.publish ? undefined : 'Available after publishing'}>
            Unpublish
          </Button>
          <div className="pub-foot-r">
            <Button onClick={() => nav(`/b/${storageId}/${slug}/preview`)}>Preview as reader</Button>
            <Button variant="primary" onClick={() => publish()} disabled={busy || (mode === 'share' && !onDrive)}>
              {busy ? <Working label="Publishing" /> : mode === 'share' ? 'Publish share link' : 'Download static site'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
