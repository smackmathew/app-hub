import { Link } from "react-router-dom";
import { formatMoney, timeAgo } from "../lib/format";
import { providerName } from "../lib/providers";
import type { App, InboxItem, Sale } from "../types";
import AppDot from "./AppDot";

export function RecentInbox({ items, apps }: { items: InboxItem[]; apps: Record<string, App> }) {
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink-2">Latest messages & chats</h3>
        <Link to="/inbox" className="text-xs font-medium text-accent">
          Open inbox →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Nothing yet. Connect a support service or a contact form on an app's page.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2 text-sm">
              <span className="mt-1.5">
                <AppDot color={apps[item.app_id]?.color ?? 0} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="font-medium">{item.from_name || item.from_email || "Visitor"}</span>
                  <span className="text-ink-muted"> · {item.subject || item.preview || "(no text)"}</span>
                </p>
                <p className="text-xs text-ink-muted">
                  {apps[item.app_id]?.name ?? "Removed app"} · {providerName(item.source)} · {timeAgo(item.received_at.toDate())}
                  {item.status === "open" && <span className="ml-1 font-medium text-ink-2">· Open</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecentSales({ sales, apps }: { sales: Sale[]; apps: Record<string, App> }) {
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink-2">Latest sales</h3>
        <Link to="/sales" className="text-xs font-medium text-accent">
          All sales →
        </Link>
      </div>
      {sales.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No sales yet. Connect Stripe (or report sales to the webhook) on an app's page.</p>
      ) : (
        <ul className="divide-y divide-line">
          {sales.map((sale) => (
            <li key={sale.id} className="flex items-center gap-3 py-2 text-sm">
              <AppDot color={apps[sale.app_id]?.color ?? 0} />
              <div className="min-w-0 flex-1">
                <p className="truncate">{sale.description || sale.customer_email || "Sale"}</p>
                <p className="text-xs text-ink-muted">
                  {apps[sale.app_id]?.name ?? "Removed app"} · {timeAgo(sale.created_at.toDate())}
                </p>
              </div>
              <span className="tabular font-semibold">{formatMoney(sale.amount_cents, sale.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
