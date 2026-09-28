import { useState } from "react";
import { IntegrationsApi, errorMessage } from "../data/api";

/** Pulls fresh numbers now instead of waiting for the hourly sync. */
export default function SyncButton({ appId }: { appId?: string }) {
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  async function sync() {
    setState("busy");
    try {
      const results = Object.values(await IntegrationsApi.syncNow(appId));
      const failed = results.filter((r) => !r.ok).length;
      setState(results.length === 0 ? "Nothing to sync" : failed ? `${failed} failed` : "Up to date");
    } catch (error) {
      setState(errorMessage(error));
    }
    setTimeout(() => setState("idle"), 4000);
  }
  return (
    <button className="btn-ghost" onClick={sync} disabled={state === "busy"} title="Sync connected services now">
      {state === "busy" ? "Syncing…" : state === "idle" ? "↻ Sync now" : state}
    </button>
  );
}
