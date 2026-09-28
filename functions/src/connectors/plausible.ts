// Traffic from Plausible Analytics (plausible.io or self-hosted), via the Stats API v2.
import { daysBetween } from "../dates.js";
import type { Connector, DailyValues, SyncContext } from "../types.js";
import { requestJson, zeroDays } from "./http.js";

function query(ctx: SyncContext, from: string, to: string) {
  const base = (ctx.config.base_url || "https://plausible.io").replace(/\/+$/, "");
  return requestJson(ctx.fetch, "Plausible", `${base}/api/v2/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.secrets.api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      site_id: ctx.config.site_id,
      metrics: ["visitors", "pageviews"],
      date_range: [from, to],
      dimensions: ["time:day"],
    }),
  });
}

export const plausible: Connector = {
  async verify(ctx) {
    await query(ctx, ctx.to, ctx.to);
  },

  async sync(ctx) {
    const daily = zeroDays<DailyValues>(daysBetween(ctx.from, ctx.to), () => ({ visitors: 0, pageviews: 0 }));
    const response = await query(ctx, ctx.from, ctx.to);
    for (const row of response.results ?? []) {
      const day = String(row.dimensions?.[0] ?? "").slice(0, 10);
      if (!daily[day]) continue;
      daily[day] = { visitors: Number(row.metrics[0]) || 0, pageviews: Number(row.metrics[1]) || 0 };
    }
    return { daily };
  },
};
