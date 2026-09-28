export default function Spinner({ full = false }: { full?: boolean }) {
  return (
    <div className={`flex items-center justify-center text-sm text-ink-muted ${full ? "h-screen" : "h-48"}`}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      <span className="ml-2">Loading…</span>
    </div>
  );
}
