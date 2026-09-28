// Live views of the owner's data: each hook subscribes to Firestore and re-renders on change.
import { collection, doc, limit, onSnapshot, orderBy, query, where, type DocumentData, type Query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { App, DailyDoc, InboxItem, IntegrationStatus, Sale } from "../types";
import { useUid } from "./auth";

interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

function useLiveQuery<T>(makeQuery: () => Query<DocumentData> | null, deps: unknown[], initial: T, map: (docs: any[]) => T): Live<T> {
  const [state, setState] = useState<Live<T>>({ data: initial, loading: true, error: null });
  useEffect(() => {
    const q = makeQuery();
    if (!q) {
      setState({ data: initial, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: map(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), loading: false, error: null }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const identity = <T,>(docs: T) => docs;

export function useApps(): Live<App[]> {
  const uid = useUid();
  return useLiveQuery(() => query(collection(db, `users/${uid}/apps`), orderBy("created_at")), [uid], [], identity);
}

export function useApp(appId: string): Live<App | null> {
  const uid = useUid();
  const [state, setState] = useState<Live<App | null>>({ data: null, loading: true, error: null });
  useEffect(
    () =>
      onSnapshot(
        doc(db, `users/${uid}/apps/${appId}`),
        (snap) => setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as App) : null, loading: false, error: null }),
        (error) => setState({ data: null, loading: false, error }),
      ),
    [uid, appId],
  );
  return state;
}

/** Daily documents from `from` onwards, for each of the given apps. */
export function useDaily(appIds: string[], from: string): Live<Record<string, DailyDoc[]>> {
  const uid = useUid();
  const key = appIds.join(",");
  const [state, setState] = useState<Live<Record<string, DailyDoc[]>>>({ data: {}, loading: true, error: null });
  useEffect(() => {
    if (!appIds.length) {
      setState({ data: {}, loading: false, error: null });
      return;
    }
    const received = new Set<string>();
    setState((s) => ({ ...s, loading: true }));
    const unsubscribes = appIds.map((appId) =>
      onSnapshot(
        query(collection(db, `users/${uid}/apps/${appId}/daily`), where("date", ">=", from)),
        (snap) => {
          received.add(appId);
          setState((s) => ({
            data: { ...s.data, [appId]: snap.docs.map((d) => d.data() as DailyDoc) },
            loading: received.size < appIds.length,
            error: null,
          }));
        },
        (error) => setState((s) => ({ ...s, loading: false, error })),
      ),
    );
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key, from]);
  // Drop apps that were removed since the last render.
  const data = Object.fromEntries(appIds.map((id) => [id, state.data[id] ?? []]));
  return { ...state, data };
}

export function useInbox(max = 300): Live<InboxItem[]> {
  const uid = useUid();
  return useLiveQuery(() => query(collection(db, `users/${uid}/inbox`), orderBy("received_at", "desc"), limit(max)), [uid, max], [], identity);
}

/** Open inbox items (not limited to the newest, so counts are exact). */
export function useOpenInbox(): Live<InboxItem[]> {
  const uid = useUid();
  return useLiveQuery(() => query(collection(db, `users/${uid}/inbox`), where("status", "==", "open")), [uid], [], identity);
}

export function useSales(max = 300): Live<Sale[]> {
  const uid = useUid();
  return useLiveQuery(() => query(collection(db, `users/${uid}/sales`), orderBy("created_at", "desc"), limit(max)), [uid, max], [], identity);
}

/** Integration status documents for one app, keyed by provider ("webhook" holds the keys). */
export function useIntegrations(appId: string | null): Live<Record<string, IntegrationStatus>> {
  const uid = useUid();
  return useLiveQuery(
    () => (appId ? collection(db, `users/${uid}/apps/${appId}/integrations`) : null),
    [uid, appId],
    {},
    (docs: IntegrationStatus[]) => Object.fromEntries(docs.map((d) => [d.provider, d])),
  );
}

/** Integration status for every app, for the health column on the overview. */
export function useAllIntegrations(appIds: string[]): Record<string, Record<string, IntegrationStatus>> {
  const uid = useUid();
  const key = appIds.join(",");
  const [data, setData] = useState<Record<string, Record<string, IntegrationStatus>>>({});
  useEffect(() => {
    const unsubscribes = appIds.map((appId) =>
      onSnapshot(collection(db, `users/${uid}/apps/${appId}/integrations`), (snap) =>
        setData((d) => ({ ...d, [appId]: Object.fromEntries(snap.docs.map((x) => [x.id, x.data() as IntegrationStatus])) })),
      ),
    );
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);
  return data;
}
