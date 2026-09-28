const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

/** 1,284 / 12.9K / 4.2M */
export function formatCount(n: number): string {
  return Math.abs(n) >= 10_000 ? compact.format(n) : whole.format(Math.round(n));
}

// Currencies whose amounts Stripe already sends in whole units.
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

export function formatMoney(minorUnits: number, currency = "usd", opts: { compact?: boolean } = {}): string {
  const amount = ZERO_DECIMAL.has(currency.toLowerCase()) ? minorUnits : minorUnits / 100;
  const big = opts.compact && Math.abs(amount) >= 10_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    notation: big ? "compact" : "standard",
    maximumFractionDigits: big ? 1 : opts.compact || Math.abs(amount) >= 1000 ? 0 : 2,
  }).format(amount);
}

export function formatDay(day: string, withYear = false): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

export function timeAgo(date: Date, now = Date.now()): string {
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
