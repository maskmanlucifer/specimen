import { useRef, useState } from 'react';
import { CARD_LABEL, cardText, settingsWithDefaults, type CardOf, type PluginSetting } from '@specimen/schema';
import { PluginFrame, useFigureInputs, useSteps, StepBar, useStoryEnv, type PluginFrameHandle } from '@specimen/story';
import { Button, Field, Label, Segmented, Toggle, Working } from '../../components/ui';
import { api } from '../../lib/api';
import { useBoard } from '../../store/board';
import { toast } from '../../store/toast';
import { LazyText, PanelSection } from './SidePanel';

/** One generated control for a plugin setting. */
function SettingControl({ s, value, onChange }: { s: PluginSetting; value: unknown; onChange: (v: unknown) => void }) {
  switch (s.type) {
    case 'select':
      return s.options.length <= 4 ? (
        <Segmented size="sm" value={String(value)} onChange={(v) => onChange(typeof s.options[0] === 'number' ? Number(v) : v)} options={s.options.map((o) => ({ value: String(o), label: String(o) }))} />
      ) : (
        <select className="ui-input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {s.options.map((o) => (
            <option key={String(o)}>{String(o)}</option>
          ))}
        </select>
      );
    case 'range':
      return (
        <div className="panel-range">
          <input type="range" min={s.min} max={s.max} step={s.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />
          <span className="mono">
            {String(value)}
            {s.unit ? ` ${s.unit}` : ''}
          </span>
        </div>
      );
    case 'boolean':
      return <Toggle checked={!!value} onChange={onChange} label={s.label} />;
    case 'text':
      return <LazyText multiline={s.multiline} mono={s.multiline} rows={5} value={String(value ?? '')} onCommit={onChange} />;
  }
}

function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  if (head.includes('base64')) return new Blob([Uint8Array.from(atob(body), (c) => c.charCodeAt(0))], { type: mime });
  return new Blob([decodeURIComponent(body)], { type: mime });
}

/**
 * Side panel for a figure: live preview, settings generated from the plugin schema,
 * input cards, permissions, and the still image used for print and no-JS readers.
 */
export function FigurePanel({ card }: { card: CardOf<'figure'> }) {
  const env = useStoryEnv();
  const board = useBoard((s) => s.board)!;
  const { storageId, slug, updateCard, change } = useBoard.getState();
  const bundle = env.plugins[card.plugin];
  const inputs = useFigureInputs(board, card);
  const steps = useSteps();
  const handle = useRef<PluginFrameHandle | null>(null);
  const [busy, setBusy] = useState(false);
  if (!bundle) return <p className="panel-muted">Plugin “{card.plugin}” is not installed. Add it from the plugin library.</p>;
  const m = bundle.manifest;
  const values = settingsWithDefaults(m, card.settings);
  const setSetting = (key: string, v: unknown) => updateCard(card.id, { settings: { ...card.settings, [key]: v } } as Partial<CardOf<'figure'>>);

  const regenerate = async () => {
    setBusy(true);
    const url = await handle.current?.still();
    if (!url) {
      toast('This figure did not return a still image');
      setBusy(false);
      return;
    }
    const blob = dataUrlToBlob(url);
    const ext = blob.type === 'image/svg+xml' ? 'svg' : 'png';
    const name = `fig-${card.id}.${ext}`;
    const res = await api.uploadPart(storageId, slug, { id: `still-${card.id}-${Date.now()}`, name, offset: 0, total: blob.size }, blob, blob.type);
    if (res.src) updateCard(card.id, { still: res.src } as Partial<CardOf<'figure'>>, 'Regenerated still image');
    setBusy(false);
  };

  return (
    <>
      <div>
        <Label>Figure</Label>
        <div className="panel-title">{m.name}</div>
        <div className="mono panel-muted">
          v{board.plugins[m.id] ?? m.version} · {m.author}
        </div>
      </div>
      <div className="panel-fig">
        <PluginFrame bundle={bundle} settings={card.settings} inputs={inputs} step={steps.step} playing={steps.playing} theme={env.theme} onSteps={steps.setSteps} onStep={steps.setStep} handleRef={handle} />
        {m.stepped && steps.steps > 1 && <StepBar step={steps.step} steps={steps.steps} playing={steps.playing} onStep={steps.setStep} onPlay={steps.setPlaying} />}
      </div>

      <PanelSection title="Settings">
        {m.inputs.map((inp) => (
          <Field key={inp.key} label={inp.label}>
            <select
              className="ui-input"
              value={card.inputs[inp.key] ?? ''}
              onChange={(e) =>
                change((b) => {
                  const c = b.cards.find((x) => x.id === card.id) as CardOf<'figure'>;
                  if (e.target.value) c.inputs[inp.key] = e.target.value;
                  else delete c.inputs[inp.key];
                  b.links = b.links.filter((l) => !(l.to === card.id && l.label === 'input'));
                  if (e.target.value) b.links.push({ id: `l_${card.id}_${inp.key}`, from: e.target.value, to: card.id, label: 'input' });
                })
              }
            >
              <option value="">None</option>
              {board.cards
                .filter((c) => inp.accepts.includes(c.type))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {CARD_LABEL[c.type]}: {('title' in c && c.title) || cardText(c).slice(0, 40)}
                  </option>
                ))}
            </select>
          </Field>
        ))}
        {m.settings.map((s) => (
          <Field key={s.key} label={s.label}>
            <SettingControl s={s} value={values[s.key]} onChange={(v) => setSetting(s.key, v)} />
          </Field>
        ))}
        <Field label="Title">
          <LazyText value={card.title ?? ''} onCommit={(title) => updateCard(card.id, { title: title || undefined } as Partial<CardOf<'figure'>>)} placeholder={m.name} />
        </Field>
        <Field label="Caption">
          <LazyText multiline rows={2} value={card.caption ?? ''} onCommit={(caption) => updateCard(card.id, { caption: caption || undefined } as Partial<CardOf<'figure'>>)} />
        </Field>
      </PanelSection>

      <PanelSection title="Permissions">
        <p className="panel-muted">{m.permissions.includes('read-inputs') ? 'Reads the linked input card. ' : ''}No network access. Runs in a sandbox.</p>
      </PanelSection>

      <PanelSection title="Still image for print">
        <div className="panel-still">
          {card.still ? <span className="mono">{card.still.split('/').pop()}</span> : <span className="panel-muted">No still yet.</span>}
          <Button size="sm" icon={busy ? undefined : 'refresh'} onClick={regenerate} disabled={busy}>
            {busy ? <Working label="Rendering" /> : card.still ? 'Regenerate' : 'Create'}
          </Button>
        </div>
      </PanelSection>
    </>
  );
}
