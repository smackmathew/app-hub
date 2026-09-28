import { describe, expect, it } from "vitest";
import { chartData } from "../src/lib/chart";
import { dayTotals, pctChange, periods, seriesByDay, sumRange } from "../src/lib/metrics";
import type { App, DailyDoc } from "../src/types";

const doc = (date: string, sources: DailyDoc["sources"], extra: Partial<DailyDoc> = {}): DailyDoc => ({ date, sources, ...extra });

describe("daily totals", () => {
  it("adds sales from every source", () => {
    const t = dayTotals(doc("2026-09-01", { stripe: { revenue_cents: 1000, orders: 2 }, webhook: { revenue_cents: 500, orders: 1 } }, { messages: 2, chats: 1 }));
    expect(t).toMatchObject({ revenue_cents: 1500, orders: 3, messages: 2, chats: 1 });
  });

  it("prefers an analytics service's traffic over the snippet's, so visits aren't counted twice", () => {
    expect(dayTotals(doc("d", { plausible: { visitors: 10, pageviews: 30 }, webhook: { visitors: 9, pageviews: 28 } }))).toMatchObject({ visitors: 10, pageviews: 30 });
    expect(dayTotals(doc("d", { webhook: { visitors: 9, pageviews: 28 } }))).toMatchObject({ visitors: 9, pageviews: 28 });
  });

  it("sums a date range and compares periods", () => {
    const docs = [doc("2026-09-01", { stripe: { revenue_cents: 100 } }), doc("2026-09-05", { stripe: { revenue_cents: 200 } })];
    expect(sumRange(docs, "2026-09-02", "2026-09-05").revenue_cents).toBe(200);
    expect(periods(7, "2026-09-10")).toEqual({ from: "2026-09-04", to: "2026-09-10", prevFrom: "2026-08-28", prevTo: "2026-09-03" });
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(5, 0)).toBeNull();
  });

  it("builds one chart row per day, zero where nothing happened", () => {
    const rows = seriesByDay({ a: [doc("2026-09-02", { ga4: { visitors: 4 } })] }, ["2026-09-01", "2026-09-02"], "visitors");
    expect(rows).toEqual([
      { date: "2026-09-01", a: 0 },
      { date: "2026-09-02", a: 4 },
    ]);
  });
});

describe("chart series", () => {
  const app = (i: number): App => ({ id: `app${i}`, name: `App ${i}`, url: null, platform: "Other", color: i % 8 });

  it("keeps each app's own color, and folds the smallest into Other past eight apps", () => {
    const apps = Array.from({ length: 10 }, (_, i) => app(i));
    const docs = Object.fromEntries(apps.map((a, i) => [a.id, [doc("2026-09-01", { stripe: { revenue_cents: (i + 1) * 100 } })]]));
    const { series, rows } = chartData(apps, docs, ["2026-09-01"], "revenue_cents");
    expect(series).toHaveLength(8);
    expect(series.find((s) => s.key === "app9")!.color).toBe("var(--s1)");
    expect(series.at(-1)).toMatchObject({ key: "__other", name: "Other (3)" });
    // Apps 0-2 are the smallest: 100 + 200 + 300.
    expect(rows[0].__other).toBe(600);
  });
});
