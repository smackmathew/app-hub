import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { SyncContext } from "../src/types.js";

if (!getApps().length) initializeApp({ projectId: "demo-app-hub" });
export const db: Firestore = getFirestore();
export const TZ = "America/New_York";

let counter = 0;
/** A fresh owner with one app, so each test starts from empty data. */
export async function newApp(name = "Recipe Box") {
  counter += 1;
  const uid = `u${Date.now()}_${counter}`;
  const appId = `a${counter}`;
  await db.doc(`users/${uid}/apps/${appId}`).set({ name, url: null, platform: "Other", color: 0 });
  return { uid, appId };
}

type Route = (url: string, init: RequestInit) => unknown | Promise<unknown>;

/** A stand-in for fetch: the first route whose pattern matches the URL answers (JSON, 200). */
export function fakeFetch(routes: [RegExp, Route][]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) return new Response("not found", { status: 404 });
    const result = await route[1](url, init);
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), { status: 200 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

export function context(overrides: Partial<SyncContext> & { fetch: typeof fetch }): SyncContext {
  return {
    config: {},
    secrets: {},
    from: "2026-09-01",
    to: "2026-09-03",
    sinceMs: Date.parse("2026-09-01T00:00:00Z"),
    timeZone: TZ,
    ...overrides,
  };
}
