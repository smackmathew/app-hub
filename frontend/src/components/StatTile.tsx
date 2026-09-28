import { pctChange } from "../lib/metrics";

interface Props {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  /** For counts where going up is bad (e.g. open support requests). */
  upIsGood?: boolean;
  periodLabel?: string;
  hint?: string;
}

/** A labelled number with an optional signed change vs the previous period. */
export default function StatTile({ label, value, current, previous, upIsGood = true, periodLabel, hint }: Props) {
  const change = current !== undefined && previous !== undefined ? pctChange(current, previous) : null;
  const good = change !== null && (change >= 0) === upIsGood;
  return (
    <div className="card p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {change !== null ? (
        <p className="mt-1 text-xs text-ink-muted">
          <span className="font-semibold" style={{ color: Math.round(change) === 0 ? undefined : good ? "var(--good)" : "var(--bad)" }}>
            {change > 0 ? "▲" : change < 0 ? "▼" : ""} {Math.abs(change) >= 1000 ? ">999" : Math.abs(Math.round(change))}%
          </span>{" "}
          vs {periodLabel ?? "previous period"}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  );
}
