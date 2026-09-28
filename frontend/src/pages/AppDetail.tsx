import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppDot from "../components/AppDot";
import AppForm from "../components/AppForm";
import IntegrationCard from "../components/IntegrationCard";
import Modal from "../components/Modal";
import RangePicker, { type Range } from "../components/RangePicker";
import Snippets from "../components/Snippets";
import Spinner from "../components/Spinner";
import StackedColumns from "../components/StackedColumns";
import StatTile from "../components/StatTile";
import SyncButton from "../components/SyncButton";
import { AppsApi, errorMessage } from "../data/api";
import { useApp, useDaily, useIntegrations, useOpenInbox } from "../data/hooks";
import { chartData } from "../lib/chart";
import { formatCount, formatMoney } from "../lib/format";
import { daysBetween, periods, sumRange } from "../lib/metrics";
import { PROVIDERS } from "../lib/providers";
import { usePersisted } from "../lib/usePersisted";

const GROUPS = [
  { id: "traffic", title: "Traffic", note: "Or use the traffic snippet below." },
  { id: "sales", title: "Sales", note: "Other payment providers can report sales to the webhook below." },
  { id: "support", title: "Support & messages", note: "Contact forms and email arrive through the webhook below." },
] as const;

export default function AppDetail() {
  const { appId = "" } = useParams();
  const navigate = useNavigate();
  const app = useApp(appId);
  const [range, setRange] = usePersisted<Range>("range", 30);
  const { from, to, prevFrom, prevTo } = periods(range);
  const daily = useDaily(app.data ? [appId] : [], prevFrom);
  const integrations = useIntegrations(app.data ? appId : null);
  const open = useOpenInbox();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (app.loading) return <Spinner />;
  if (!app.data) {
    return (
      <div className="card p-10 text-center text-ink-2">
        This app doesn't exist (anymore). <Link to="/" className="text-accent">Back to the overview</Link>
      </div>
    );
  }

  const a = app.data;
  const docs = daily.data[appId] ?? [];
  const now = sumRange(docs, from, to);
  const prev = sumRange(docs, prevFrom, prevTo);
  const days = daysBetween(from, to);
  const revenue = chartData([a], daily.data, days, "revenue_cents");
  const visitors = chartData([a], daily.data, days, "visitors");
  const openCount = open.data.filter((i) => i.app_id === appId).length;
  const webhook = integrations.data.webhook;
  const label = `previous ${range} days`;

  async function remove() {
    if (!confirm(`Delete ${a.name} and everything recorded for it (numbers, sales, messages, connections)? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await AppsApi.remove(appId);
      navigate("/");
    } catch (err) {
      alert(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/" className="text-sm text-ink-2 hover:text-ink">
            ← All apps
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            <AppDot color={a.color} size={14} />
            <span className="truncate">{a.name}</span>
          </h1>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-ink-2">
            <span>{a.platform}</span>
            {a.url && (
              <a href={a.url} target="_blank" rel="noreferrer" className="text-accent">
                {a.url.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
          </p>
          {a.notes && <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-ink-2">{a.notes}</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn-danger" onClick={remove} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker value={range} onChange={setRange} />
        <SyncButton appId={appId} />
      </div>

      <div className={`space-y-4 transition-opacity ${daily.loading ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatTile label="Revenue" value={formatMoney(now.revenue_cents, "usd", { compact: true })} current={now.revenue_cents} previous={prev.revenue_cents} periodLabel={label} />
          <StatTile label="Orders" value={formatCount(now.orders)} current={now.orders} previous={prev.orders} periodLabel={label} />
          <StatTile label="Visitors" value={formatCount(now.visitors)} current={now.visitors} previous={prev.visitors} periodLabel={label} />
          <StatTile label="Page views" value={formatCount(now.pageviews)} current={now.pageviews} previous={prev.pageviews} periodLabel={label} />
          <div className="col-span-2 md:col-span-1">
            <StatTile
              label="Conversations"
              value={formatCount(now.messages + now.chats)}
              hint={`${now.messages} messages · ${now.chats} chats · ${openCount} open`}
            />
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
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Connected services</h2>
        {GROUPS.map((group) => (
          <div key={group.id}>
            <h3 className="mb-2 text-sm font-medium text-ink-2">
              {group.title} <span className="font-normal text-ink-muted">· {group.note}</span>
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {PROVIDERS.filter((p) => p.group === group.id).map((p) => (
                <IntegrationCard key={p.id} appId={appId} provider={p} status={integrations.data[p.id]} publicKey={webhook?.public_key} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Webhook: traffic snippet, contact forms, email and more</h2>
        <Snippets appId={appId} appUrl={a.url} keys={webhook} />
      </section>

      {editing && (
        <Modal title={`Edit ${a.name}`} onClose={() => setEditing(false)}>
          <AppForm
            initial={a}
            submitLabel="Save"
            onSubmit={async (fields) => {
              await AppsApi.update(appId, fields);
              setEditing(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
