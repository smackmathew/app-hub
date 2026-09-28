// Sales from Stripe: every charge/payment in the account's balance history, bucketed by day.
// Balance transactions are always in the account's settlement currency, so a day's total
// adds up even when customers pay in different currencies. Refunds subtract from the day
// they happen on.
import { addDays, dayIn, daysBetween, startOfDay } from "../dates.js";
import type { Connector, DailyValues, SaleInput, SyncContext } from "../types.js";
import { requestJson, zeroDays } from "./http.js";

const API = "https://api.stripe.com/v1";
const MAX_PAGES = 50;
const SALE_TYPES = new Set(["charge", "payment"]);
const REFUND_TYPES = new Set(["refund", "payment_refund"]);

function get(ctx: SyncContext, path: string) {
  return requestJson(ctx.fetch, "Stripe", `${API}${path}`, {
    headers: { Authorization: `Bearer ${ctx.secrets.api_key}` },
  });
}

export const stripe: Connector = {
  async verify(ctx) {
    await get(ctx, "/balance_transactions?limit=1");
  },

  async sync(ctx) {
    const daily = zeroDays<DailyValues>(daysBetween(ctx.from, ctx.to), () => ({ revenue_cents: 0, orders: 0 }));
    const sales: SaleInput[] = [];
    const createdGte = Math.floor(startOfDay(ctx.from, ctx.timeZone) / 1000);
    const createdLt = Math.floor(startOfDay(addDays(ctx.to, 1), ctx.timeZone) / 1000);

    let startingAfter: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({ limit: "100", "created[gte]": String(createdGte), "created[lt]": String(createdLt) });
      query.append("expand[]", "data.source");
      if (startingAfter) query.set("starting_after", startingAfter);
      const list = await get(ctx, `/balance_transactions?${query}`);

      for (const bt of list.data ?? []) {
        const day = dayIn(ctx.timeZone, bt.created * 1000);
        const totals = daily[day];
        if (!totals) continue;
        if (SALE_TYPES.has(bt.type)) {
          totals.revenue_cents! += bt.amount;
          totals.orders! += 1;
          const source = typeof bt.source === "object" && bt.source ? bt.source : null;
          sales.push({
            id: source?.id ?? bt.id,
            amount_cents: bt.amount,
            currency: bt.currency,
            customer_email: source?.billing_details?.email ?? source?.receipt_email ?? null,
            description: source?.description ?? bt.description ?? null,
            created_at: bt.created * 1000,
          });
        } else if (REFUND_TYPES.has(bt.type)) {
          totals.revenue_cents! += bt.amount; // negative
        }
      }

      if (!list.has_more || !list.data?.length) break;
      startingAfter = list.data[list.data.length - 1].id;
    }
    return { daily, sales };
  },
};
