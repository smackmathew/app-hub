export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export default function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="radiogroup" aria-label="Date range">
      {RANGES.map((r) => (
        <button
          key={r}
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={`rounded-md px-3 py-1 text-sm font-medium ${value === r ? "bg-sel text-ink" : "text-ink-2 hover:bg-hover"}`}
        >
          {r} days
        </button>
      ))}
    </div>
  );
}
