import { useState, type FormEvent } from "react";
import { IntegrationsApi, errorMessage } from "../data/api";
import { HOOKS_URL } from "../firebase";
import { timeAgo } from "../lib/format";
import type { ProviderInfo } from "../lib/providers";
import type { IntegrationStatus } from "../types";
import CopyField from "./CopyField";

interface Props {
  appId: string;
  provider: ProviderInfo;
  status: IntegrationStatus | undefined;
  publicKey: string | undefined;
}

export default function IntegrationCard({ appId, provider, status, publicKey }: Props) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connected = !!status;
  const tawkUrl = publicKey ? `${HOOKS_URL}/tawk/${publicKey}` : "";

  async function connect(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const config: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    for (const f of provider.fields) (f.secret ? secrets : config)[f.name] = values[f.name] ?? "";
    try {
      await IntegrationsApi.connect(appId, provider.id, config, secrets);
      setOpen(false);
      setValues({});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${provider.name}? Numbers already collected stay.`)) return;
    setBusy(true);
    try {
      await IntegrationsApi.disconnect(appId, provider.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium">{provider.name}</h4>
          <p className="text-sm text-ink-2">{provider.blurb}</p>
        </div>
        {connected ? (
          <button className="btn-ghost shrink-0" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        ) : (
          <button className="btn-ghost shrink-0" onClick={() => setOpen((o) => !o)}>
            {open ? "Cancel" : "Connect"}
          </button>
        )}
      </div>

      {connected && (
        <p className="mt-2 text-sm">
          {status.status === "error" ? (
            <span style={{ color: "var(--warn)" }}>
              ⚠ Last sync failed: <span className="text-ink-2">{status.last_error}</span>
            </span>
          ) : (
            <span className="text-ink-2">
              <span style={{ color: "var(--good)" }}>✓</span> Connected
              {status.last_sync_at ? ` · synced ${timeAgo(status.last_sync_at.toDate())}` : provider.id === "tawk" ? " · waiting for events" : ""}
            </span>
          )}
        </p>
      )}

      {connected && provider.id === "tawk" && tawkUrl && (
        <div className="mt-3">
          <CopyField label="Webhook URL for Tawk.to" value={tawkUrl} />
        </div>
      )}

      {!connected && open && (
        <form onSubmit={connect} className="mt-4 space-y-3">
          <p className="text-xs text-ink-muted">{provider.help}</p>
          {provider.id === "tawk" && tawkUrl && <CopyField label="Webhook URL to paste into Tawk.to" value={tawkUrl} />}
          {provider.fields.map((f) => (
            <div key={f.name}>
              <label className="label" htmlFor={`${provider.id}-${f.name}`}>
                {f.label} {f.optional && <span className="font-normal text-ink-muted">(optional)</span>}
              </label>
              {f.multiline ? (
                <textarea
                  id={`${provider.id}-${f.name}`}
                  className="input font-mono text-xs"
                  rows={4}
                  required={!f.optional}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                />
              ) : (
                <input
                  id={`${provider.id}-${f.name}`}
                  className="input"
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  required={!f.optional}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                />
              )}
            </div>
          ))}
          {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}
          <button className="btn-primary" disabled={busy}>
            {busy ? "Checking and importing…" : `Connect ${provider.name}`}
          </button>
          <p className="text-xs text-ink-muted">Credentials are stored server-side only; this page can't read them back.</p>
        </form>
      )}
      {connected && error && <p className="mt-2 text-sm text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}
