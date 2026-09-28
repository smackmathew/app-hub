import type { Series } from "../components/StackedColumns";
import type { App, DailyDoc } from "../types";
import { dayTotals, seriesByDay, type Metric } from "./metrics";
import { seriesColor } from "./palette";

const MAX_SERIES = 8;

/**
 * Stacked-chart rows and series, one per app, in the apps' own colors. Past eight apps the
 * smallest fold into "Other" so no color repeats.
 */
export function chartData(apps: App[], docsByApp: Record<string, DailyDoc[]>, days: string[], metric: Metric) {
  const size = (app: App) => (docsByApp[app.id] ?? []).filter((d) => d.date >= days[0]).reduce((s, d) => s + dayTotals(d)[metric], 0);
  let shown = apps;
  let folded: App[] = [];
  if (apps.length > MAX_SERIES) {
    const ranked = [...apps].sort((a, b) => size(b) - size(a));
    const keep = new Set(ranked.slice(0, MAX_SERIES - 1).map((a) => a.id));
    shown = apps.filter((a) => keep.has(a.id));
    folded = apps.filter((a) => !keep.has(a.id));
  }
  const docs: Record<string, DailyDoc[]> = Object.fromEntries(shown.map((a) => [a.id, docsByApp[a.id] ?? []]));
  if (folded.length) docs.__other = folded.flatMap((a) => docsByApp[a.id] ?? []);

  // Folded apps can share a day; seriesByDay sums per doc, so merge them by date first.
  if (docs.__other) {
    const byDate: Record<string, DailyDoc> = {};
    for (const d of docs.__other) {
      const t = dayTotals(d);
      const prev = byDate[d.date]?.sources?.all ?? {};
      byDate[d.date] = {
        date: d.date,
        sources: {
          all: {
            visitors: (prev.visitors ?? 0) + t.visitors,
            pageviews: (prev.pageviews ?? 0) + t.pageviews,
            revenue_cents: (prev.revenue_cents ?? 0) + t.revenue_cents,
            orders: (prev.orders ?? 0) + t.orders,
          },
        },
        messages: (byDate[d.date]?.messages ?? 0) + t.messages,
        chats: (byDate[d.date]?.chats ?? 0) + t.chats,
      };
    }
    docs.__other = Object.values(byDate);
  }

  const series: Series[] = shown.map((a) => ({ key: a.id, name: a.name, color: seriesColor(a.color) }));
  if (folded.length) series.push({ key: "__other", name: `Other (${folded.length})`, color: "var(--ink-muted)" });
  return { rows: seriesByDay(docs, days, metric), series };
}
