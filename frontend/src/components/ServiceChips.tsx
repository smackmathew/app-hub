import { providerName } from "../lib/providers";
import type { IntegrationStatus } from "../types";

/** Connected services with a ✓ or ⚠, so the icon and text carry the state, not just color. */
export default function ServiceChips({ integrations }: { integrations: Record<string, IntegrationStatus> | undefined }) {
  const services = Object.values(integrations ?? {}).filter((i) => i.provider !== "webhook");
  if (!services.length) return <span className="text-ink-muted">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {services.map((s) => (
        <span
          key={s.provider}
          title={s.status === "error" ? s.last_error ?? "Sync failed" : "Connected"}
          className="relative inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-xs text-ink-2"
        >
          <span aria-hidden style={{ color: s.status === "error" ? "var(--warn)" : "var(--good)" }}>
            {s.status === "error" ? "⚠" : "✓"}
          </span>
          {providerName(s.provider)}
          {s.status === "error" && <span className="sr-only">(sync failed)</span>}
        </span>
      ))}
    </span>
  );
}
