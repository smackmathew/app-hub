import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RecentInbox, RecentSales } from "../components/ActivityList";
import AppDot from "../components/AppDot";
import AppForm from "../components/AppForm";
import Modal from "../components/Modal";
import RangePicker, { type Range } from "../components/RangePicker";
import ServiceChips from "../components/ServiceChips";
import Spinner from "../components/Spinner";
import StackedColumns from "../components/StackedColumns";
import StatTile from "../components/StatTile";
import SyncButton from "../components/SyncButton";
import { AppsApi } from "../data/api";
import { useAllIntegrations, useApps, useDaily, useInbox, useOpenInbox, useSales } from "../data/hooks";
import { chartData } from "../lib/chart";
import { formatCount, formatMoney } from "../lib/format";
import { addTotals, daysBetween, emptyTotals, periods, sumRange } from "../lib/metrics";
import { nextFreeSlot } from "../lib/palette";
import { usePersisted } from "../lib/usePersisted";

export default function Overview() {
  const navigate = useNavigate();
  const [range, setRange] = usePersisted<Range>("range", 30);
  const [adding, setAdding] = useState(false);
  const apps = useApps();
  const appIds = apps.data.map((a) => a.id);
  const { from, to, prevFrom, prevTo } = periods(range);
  const daily = useDaily(appIds, prevFrom);
  const open = useOpenInbox();
  const recentInbox = useInbox(6);
  const recentSales = useSales(6);
  const integrations = useAllIntegrations(appIds);

  const appsById = Object.fromEntries(apps.data.map((a) => [a.id, a]));
  const days = daysBetween(from, to);
  const perApp = apps.data.map((app) => ({
    app,
    now: sumRange(daily.data[app.id] ?? [], from, to),
    open: open.data.filter((i) => i.app_id === app.id).length,
  }));
  const total = perApp.reduce((acc, p) => addTotals(acc, p.now), emptyTotals());
  const prev = apps.data.reduce((acc, app) => addTotals(acc, sumRange(daily.data[app.id] ?? [], prevFrom, prevTo)), emptyTotals());
  const revenue = useMemo(() => chartData(apps.data, daily.data, days, "revenue_cents"), [apps.data, daily.data, from, to]);
  const visitors = useMemo(() => chartData(apps.data, daily.data, days, "visitors"), [apps.data, daily.data, from, to]);

  if (apps.loading) return <Spinner />;

  const addModal = adding && (
    <Modal title="Add an app" onClose={() => setAdding(false)}>
      <AppForm
        submitLabel="Add app"
        initial={{ color: nextFreeSlot(apps.data.map((a) => a.color)) }}
        onSubmit={async (fields) => navigate(`/apps/${await AppsApi.create(fields)}`)}
      />
    </Modal>
  );

  if (!apps.data.length) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">Track every app in one place</h1>
        <p className="mt-2 text-ink-2">
          Add each web app you've built, whether here, on Base44, Lovable, Vercel or anywhere else. Then connect its traffic (Plausible, Google Analytics or
          a one-line snippet), sales (Stripe) and support (Crisp, Intercom, Tawk.to, contact forms and email). Numbers refresh every hour.
        </p>
        <button className="btn-primary mt-6" onClick={() => setAdding(true)}>
          Add your first app
        </button>
        {addModal}
      </div>
    );
  }

  const label = `previous ${range} days`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker value={range} onChange={setRange} />
        <div className="flex gap-2">
          <SyncButton />
          <button className="btn-primary" onClick={() => setAdding(true)}>
            + Add app
          </button>
        </div>
      </div>

      <div className={`space-y-6 transition-opacity ${daily.loading ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatTile label="Revenue" value={formatMoney(total.revenue_cents, "usd", { compact: true })} current={total.revenue_cents} previous={prev.revenue_cents} periodLabel={label} />
          <StatTile label="Orders" value={formatCount(total.orders)} current={total.orders} previous={prev.orders} periodLabel={label} />
          <StatTile label="Visitors" value={formatCount(total.visitors)} current={total.visitors} previous={prev.visitors} periodLabel={label} />
          <StatTile
            label="New messages & chats"
            value={formatCount(total.messages + total.chats)}
            current={total.messages + total.chats}
            previous={prev.messages + prev.chats}
            upIsGood={false}
            periodLabel={label}
          />
          <div className="col-span-2 md:col-span-1">
            <StatTile label="Waiting in inbox" value={formatCount(open.data.length)} hint={open.data.length ? "Open messages and chats" : "All caught up"} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StackedColumns
            title="Revenue by day"
            rows={revenue.rows}
            series={revenue.series}
            format={(v) => formatMoney(v)}
            formatAxis={(v) => formatMoney(v, "usd", { compact: true })}
            minTop={10000}
          />
          <StackedColumns title="Visitors by day" rows={visitors.rows} series={visitors.series} format={formatCount} />
        </div>

        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">App</th>
                  <th className="px-3 py-2 text-right font-medium">Visitors</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium">New conversations</th>
                  <th className="px-3 py-2 text-right font-medium">Open</th>
                  <th className="px-4 py-2 font-medium">Services</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {perApp.map(({ app, now, open: openCount }) => (
                  <tr key={app.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-hover" onClick={() => navigate(`/apps/${app.id}`)}>
                    <td className="px-4 py-2.5">
                      <Link to={`/apps/${app.id}`} className="flex items-center gap-2 whitespace-nowrap font-medium" onClick={(e) => e.stopPropagation()}>
                        <AppDot color={app.color} />
                        {app.name}
                        <span className="text-xs font-normal text-ink-muted">{app.platform}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatCount(now.visitors)}</td>
                    <td className="px-3 py-2.5 text-right">{formatMoney(now.revenue_cents)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCount(now.orders)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCount(now.messages + now.chats)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{openCount || <span className="text-ink-muted">0</span>}</td>
                    <td className="min-w-[220px] px-4 py-2.5">
                      <ServiceChips integrations={integrations[app.id]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentInbox items={recentInbox.data} apps={appsById} />
          <RecentSales sales={recentSales.data} apps={appsById} />
        </div>
      </div>
      {addModal}
    </div>
  );
}
