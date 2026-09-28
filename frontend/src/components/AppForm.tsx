import { useState, type FormEvent } from "react";
import { errorMessage, type AppFields } from "../data/api";
import { seriesColor } from "../lib/palette";
import { PLATFORMS } from "../lib/providers";

interface Props {
  initial?: Partial<AppFields>;
  submitLabel: string;
  onSubmit: (fields: AppFields) => Promise<void>;
}

export default function AppForm({ initial = {}, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [url, setUrl] = useState(initial.url ?? "");
  const [platform, setPlatform] = useState(initial.platform ?? "Claude");
  const [color, setColor] = useState(initial.color ?? 0);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let cleanUrl = url.trim() || null;
      if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) cleanUrl = `https://${cleanUrl}`;
      await onSubmit({ name: name.trim(), url: cleanUrl, platform: platform.trim() || "Other", color, notes: notes.trim() });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="app-name">
          Name
        </label>
        <input id="app-name" className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe Box" />
      </div>
      <div>
        <label className="label" htmlFor="app-url">
          Web address
        </label>
        <input id="app-url" className="input" maxLength={300} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="recipebox.app" />
      </div>
      <div>
        <label className="label" htmlFor="app-platform">
          Built or hosted on
        </label>
        <input id="app-platform" className="input" list="platforms" maxLength={40} value={platform} onChange={(e) => setPlatform(e.target.value)} />
        <datalist id="platforms">
          {PLATFORMS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <fieldset>
        <legend className="label">Color</legend>
        <div className="flex gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <button
              type="button"
              key={i}
              onClick={() => setColor(i)}
              aria-label={`Color ${i + 1}`}
              aria-pressed={color === i}
              className={`h-7 w-7 rounded-md ring-offset-2 ring-offset-[color:var(--surface)] ${color === i ? "ring-2 ring-[color:var(--ink)]" : ""}`}
              style={{ background: seriesColor(i) }}
            />
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="app-notes">
          Notes
        </label>
        <textarea id="app-notes" className="input" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
