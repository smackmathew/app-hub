// Turns stored daily documents into the numbers the dashboard shows.
import type { DailyDoc } from "../types";

export interface Totals {
  visitors: number;
  pageviews: number;
  revenue_cents: number;
  orders: number;
  messages: number;
  chats: number;
}

export type Metric = keyof Totals;

export const emptyTotals = (): Totals => ({ visitors: 0, pageviews: 0, revenue_cents: 0, orders: 0, messages: 0, chats: 0 });

/**
 * One day's totals, adding up every source. Traffic is the exception: a connected analytics
 * service (Plausible/GA4) is the better count, so the tracking snippet's numbers are only
 * used when no analytics service reported that day.
 */
export function dayTotals(doc: DailyDoc | undefined): Totals {
  const totals = emptyTotals();
  if (!doc) return totals;
  const sources = doc.sources ?? {};
  const hasAnalytics = Object.keys(sources).some((s) => s === "plausible" || s === "ga4");
  for (const [source, values] of Object.entries(sources)) {
    if (!(hasAnalytics && source === "webhook")) {
      totals.visitors += values.visitors ?? 0;
      totals.pageviews += values.pageviews ?? 0;
    }
    totals.revenue_cents += values.revenue_cents ?? 0;
    totals.orders += values.orders ?? 0;
  }
  totals.messages = doc.messages ?? 0;
  totals.chats = doc.chats ?? 0;
  return totals;
}

export function addTotals(a: Totals, b: Totals): Totals {
  const out = emptyTotals();
  for (const key of Object.keys(out) as Metric[]) out[key] = a[key] + b[key];
  return out;
}

/** Totals over docs whose date is in [from, to]. */
export function sumRange(docs: DailyDoc[], from: string, to: string): Totals {
  return docs.filter((d) => d.date >= from && d.date <= to).reduce((acc, d) => addTotals(acc, dayTotals(d)), emptyTotals());
}

export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** The current period (last `n` days, ending today) and the one before it. */
export function periods(n: number, today = localDay()) {
  const from = addDays(today, -(n - 1));
  return { from, to: today, prevFrom: addDays(from, -n), prevTo: addDays(from, -1) };
}

/** Rows for a stacked chart: one per day, one key per app. */
export function seriesByDay(docsByApp: Record<string, DailyDoc[]>, days: string[], metric: Metric): Array<Record<string, number | string>> {
  const lookup: Record<string, Record<string, DailyDoc>> = {};
  for (const [appId, docs] of Object.entries(docsByApp)) {
    lookup[appId] = Object.fromEntries(docs.map((d) => [d.date, d]));
  }
  return days.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const appId of Object.keys(docsByApp)) row[appId] = dayTotals(lookup[appId][date])[metric];
    return row;
  });
}

/** Percentage change, or null when there's nothing to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
