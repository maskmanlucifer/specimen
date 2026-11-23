import { useState } from 'react';
import { cloudConfig, saveCloudConfig, type CloudConfig } from '../backend/cloud';
import { REPO_URL } from '../lib/links';
import { Button, Field, Input } from './ui';

/**
 * "Bring your own Supabase": the form where a person pastes their project URL and public key.
 * Both values are safe in a browser; the Google client secret stays in their Edge Function.
 */
export function CloudSetup({ onSaved, onCancel }: { onSaved: (cfg: CloudConfig) => void; onCancel?: () => void }) {
  const cur = cloudConfig();
  const [url, setUrl] = useState(cur?.url ?? '');
  const [anonKey, setAnonKey] = useState(cur?.anonKey ?? '');
  const [apiKey, setApiKey] = useState(cur?.apiKey ?? '');
  const valid = /^https:\/\/[\w-]+\.supabase\.co\/?$/.test(url.trim()) && anonKey.trim().length > 20;

  const save = () => {
    const cfg = { url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim(), apiKey: apiKey.trim() || undefined };
    saveCloudConfig(cfg);
    onSaved(cfg);
  };

  return (
    <div className="cloud-setup">
      <Field label="Supabase project URL" hint="Supabase → Project settings → API">
        <Input id="cloud-url" mono value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://abcd1234.supabase.co" />
      </Field>
      <Field label="Public anon key" hint="The anon / publishable key. Never paste the service_role key.">
        <Input id="cloud-anon" mono value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJhbGciOi…" />
      </Field>
      <Field label="Google API key (optional)" hint="Only for share links that readers open without signing in.">
        <Input id="cloud-api" mono value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza…" />
      </Field>
      <p className="cloud-setup-help">
        New to this? Follow the <a href={`${REPO_URL}/blob/main/docs/cloud-setup.md`} target="_blank" rel="noreferrer">10-minute setup guide</a>. It creates the Supabase project, the Google sign-in and the Drive token function.
      </p>
      <div className="cloud-setup-actions">
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button variant="primary" disabled={!valid} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
