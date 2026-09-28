import { useState } from "react";
import AppDot from "../components/AppDot";
import Spinner from "../components/Spinner";
import { InboxApi } from "../data/api";
import { useApps, useInbox } from "../data/hooks";
import { timeAgo } from "../lib/format";
import { providerName } from "../lib/providers";
import { usePersisted } from "../lib/usePersisted";
import type { InboxItem } from "../types";

type StatusFilter = "open" | "closed" | "all";
type KindFilter = "all" | "message" | "chat";

export default function Inbox() {
  const apps = useApps();
  const inbox = useInbox(500);
  const [status, setStatus] = usePersisted<StatusFilter>("inbox.status", "open");
  const [kind, setKind] = usePersisted<KindFilter>("inbox.kind", "all");
  const [appId, setAppId] = useState("all");
  const appsById = Object.fromEntries(apps.data.map((a) => [a.id, a]));

  const items = inbox.data.filter(
    (i) => (status === "all" || i.status === status) && (kind === "all" || i.kind === kind) && (appId === "all" || i.app_id === appId),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Inbox</h1>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
          <option value="open">Open</option>
          <option value="closed">Done</option>
          <option value="all">All</option>
        </select>
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Type">
          <option value="all">Messages & chats</option>
          <option value="message">Messages</option>
          <option value="chat">Chats</option>
        </select>
        <select className="input w-auto" value={appId} onChange={(e) => setAppId(e.target.value)} aria-label="App">
          <option value="all">All apps</option>
          {apps.data.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {inbox.loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-ink-2">{status === "open" ? "All caught up. Nothing is waiting on you." : "Nothing here."}</div>
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((item) => (
            <Row key={item.id} item={item} appName={appsById[item.app_id]?.name ?? "Removed app"} color={appsById[item.app_id]?.color ?? 0} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ item, appName, color }: { item: InboxItem; appName: string; color: number }) {
  const [expanded, setExpanded] = useState(false);
  const received = item.received_at.toDate();
  const toggle = () => InboxApi.setStatus(item.id, item.status === "open" ? "closed" : "open");
  const reply = item.from_email ? `mailto:${item.from_email}?subject=${encodeURIComponent(`Re: ${item.subject ?? appName}`)}` : null;

  return (
    <li className={`p-4 ${item.status === "closed" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-1.5">
          <AppDot color={color} />
        </span>
        <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{item.from_name || item.from_email || "Visitor"}</span>
            {item.from_name && item.from_email && <span className="text-sm text-ink-muted">{item.from_email}</span>}
          </p>
          {item.subject && <p className="text-sm font-medium">{item.subject}</p>}
          <p className={`text-sm text-ink-2 ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{item.preview || "(no text)"}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {appName} · {item.kind === "chat" ? "Chat" : "Message"} via {providerName(item.source)} ·{" "}
            <time dateTime={received.toISOString()} title={received.toLocaleString()}>
              {timeAgo(received)}
            </time>
          </p>
        </button>
        <div className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
          {item.url && (
            <a className="btn-ghost" href={item.url} target="_blank" rel="noreferrer">
              Open in {providerName(item.source)} ↗
            </a>
          )}
          {!item.url && reply && (
            <a className="btn-ghost" href={reply}>
              Reply
            </a>
          )}
          <button className={item.status === "open" ? "btn-primary" : "btn-ghost"} onClick={toggle}>
            {item.status === "open" ? "✓ Done" : "Reopen"}
          </button>
        </div>
      </div>
    </li>
  );
}
