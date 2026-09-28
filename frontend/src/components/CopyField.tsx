import { useState } from "react";

export default function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShown(true);
    }
  }
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex gap-2">
        <code className="input min-w-0 flex-1 truncate font-mono text-xs leading-5">{shown ? value : "•".repeat(Math.min(value.length, 32))}</code>
        {secret && (
          <button className="btn-ghost" onClick={() => setShown((s) => !s)}>
            {shown ? "Hide" : "Show"}
          </button>
        )}
        <button className="btn-ghost" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
