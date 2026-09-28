import { useState } from "react";
import AppDot from "../components/AppDot";
import Spinner from "../components/Spinner";
import { useApps, useSales } from "../data/hooks";
import { formatMoney } from "../lib/format";
import { providerName } from "../lib/providers";

export default function Sales() {
  const apps = useApps();
  const sales = useSales(500);
  const [appId, setAppId] = useState("all");
  const appsById = Object.fromEntries(apps.data.map((a) => [a.id, a]));
  const rows = sales.data.filter((s) => appId === "all" || s.app_id === appId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Sales</h1>
        <select className="input w-auto" value={appId} onChange={(e) => setAppId(e.target.value)} aria-label="App">
          <option value="all">All apps</option>
          {apps.data.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-ink-muted">Latest {rows.length} sales. Daily totals (with refunds) are on the overview.</span>
      </div>
      {sales.loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-ink-2">No sales yet. Connect Stripe on an app's page, or report sales to its webhook.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tabular w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">App</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-ink-2">
                    {s.created_at.toDate().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <AppDot color={appsById[s.app_id]?.color ?? 0} />
                      {appsById[s.app_id]?.name ?? "Removed app"}
                      <span className="text-xs text-ink-muted">{providerName(s.source)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">{s.customer_email ?? <span className="text-ink-muted">—</span>}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-ink-2">{s.description ?? ""}</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatMoney(s.amount_cents, s.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
