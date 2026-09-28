// Connecting services to an app, syncing them, and the app's webhook keys.
//
// Credentials live in the top-level integration_secrets collection and webhook keys in
// ingest_keys. firestore.rules has no rule for either, so the web app can never read them;
// only these functions (which use the Admin SDK) can. What the web app sees is the status
// document at users/{uid}/apps/{appId}/integrations/{provider}, which holds no secrets.
import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { PROVIDERS, isProvider } from "./connectors/index.js";
import { addDays, dayIn } from "./dates.js";
import { appPath, upsertInbox, writeDaily, writeSales } from "./store.js";
import type { Provider, SyncContext } from "./types.js";

/** How far back the first sync of a service goes. */
export const INITIAL_DAYS = 90;
const DAY_MS = 86_400_000;

export interface Deps {
  timeZone: string;
  fetch: typeof fetch;
  now?: () => number;
}

/** A problem with what the caller sent; index.ts turns it into an HttpsError. */
export class UserError extends Error {}

export const secretsId = (uid: string, appId: string, provider: Provider) => `${uid}__${appId}__${provider}`;
const statusPath = (uid: string, appId: string, provider: string) => `${appPath(uid, appId)}/integrations/${provider}`;

async function requireApp(db: Firestore, uid: string, appId: unknown): Promise<string> {
  if (typeof appId !== "string" || !appId || appId.includes("/")) throw new UserError("appId is required");
  if (!(await db.doc(appPath(uid, appId)).get()).exists) throw new UserError("That app doesn't exist");
  return appId;
}

function pickFields(spec: string[], values: unknown, what: string): Record<string, string> {
  const input = (values ?? {}) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const entry of spec) {
    const optional = entry.endsWith("?");
    const name = entry.replace(/\?$/, "");
    const value = typeof input[name] === "string" ? (input[name] as string).trim() : "";
    if (!value && !optional) throw new UserError(`${what} ${name} is required`);
    if (value) result[name] = value;
  }
  return result;
}

function contextFor(config: Record<string, string>, secrets: Record<string, string>, state: any, deps: Deps): SyncContext {
  const now = deps.now?.() ?? Date.now();
  const today = dayIn(deps.timeZone, now);
  // Re-fetch from the day before the last sync so late-arriving numbers (and yesterday's
  // final totals) are picked up.
  const from = state?.last_synced_day ? addDays(state.last_synced_day, -1) : addDays(today, -(INITIAL_DAYS - 1));
  const sinceMs = state?.last_synced_at ? state.last_synced_at - 60 * 60_000 : now - INITIAL_DAYS * DAY_MS;
  return { config, secrets, from, to: today, sinceMs, timeZone: deps.timeZone, fetch: deps.fetch };
}

/** Checks the credentials, stores them, and runs the first sync. */
export async function connectIntegration(
  db: Firestore,
  uid: string,
  data: { appId?: unknown; provider?: unknown; config?: unknown; secrets?: unknown },
  deps: Deps,
) {
  const appId = await requireApp(db, uid, data.appId);
  if (!isProvider(data.provider)) throw new UserError("Unknown service");
  const provider = data.provider;
  const spec = PROVIDERS[provider];
  const config = pickFields(spec.config, data.config, "Setting");
  const secrets = pickFields(spec.secrets, data.secrets, "Credential");
  if (config.base_url && !/^https:\/\//.test(config.base_url)) throw new UserError("The address must start with https://");

  if (spec.connector) {
    try {
      Object.assign(config, (await spec.connector.verify(contextFor(config, secrets, null, deps))) ?? {});
    } catch (error) {
      throw new UserError(`Couldn't connect: ${(error as Error).message}`);
    }
  }

  const secretsRef = db.doc(`integration_secrets/${secretsId(uid, appId, provider)}`);
  await secretsRef.set({ uid, app_id: appId, provider, config, secrets, state: {} });
  await db.doc(statusPath(uid, appId, provider)).set({
    provider,
    config,
    status: "connected",
    last_error: null,
    last_sync_at: null,
    connected_at: FieldValue.serverTimestamp(),
  });
  if (spec.connector) await syncIntegration(db, await secretsRef.get(), deps);
}

export async function disconnectIntegration(db: Firestore, uid: string, data: { appId?: unknown; provider?: unknown }) {
  const appId = await requireApp(db, uid, data.appId);
  if (!isProvider(data.provider)) throw new UserError("Unknown service");
  await db.doc(`integration_secrets/${secretsId(uid, appId, data.provider)}`).delete();
  await db.doc(statusPath(uid, appId, data.provider)).delete();
}

/** Pulls new data for one connected service. Records (rather than throws) a failure. */
export async function syncIntegration(db: Firestore, snapshot: DocumentSnapshot, deps: Deps): Promise<{ ok: boolean; error?: string }> {
  const { uid, app_id: appId, provider, config, secrets, state } = snapshot.data() as any;
  const connector = PROVIDERS[provider as Provider]?.connector;
  if (!connector) return { ok: true };
  const statusRef = db.doc(statusPath(uid, appId, provider));
  const now = deps.now?.() ?? Date.now();
  const ctx = contextFor(config, secrets, state, deps);
  try {
    const result = await connector.sync(ctx);
    if (result.daily) await writeDaily(db, uid, appId, provider, result.daily);
    if (result.sales) await writeSales(db, uid, appId, provider, result.sales);
    for (const item of result.inbox ?? []) await upsertInbox(db, uid, appId, provider, item, deps.timeZone);
    await snapshot.ref.update({ state: { last_synced_day: ctx.to, last_synced_at: now } });
    await statusRef.set({ status: "connected", last_error: null, last_sync_at: Timestamp.fromMillis(now) }, { merge: true });
    return { ok: true };
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    await statusRef.set({ status: "error", last_error: message.slice(0, 500), last_sync_at: Timestamp.fromMillis(now) }, { merge: true });
    return { ok: false, error: message };
  }
}

/** Syncs every connected service, optionally only one owner's (or one app's). */
export async function syncAll(db: Firestore, deps: Deps, filter: { uid?: string; appId?: string } = {}) {
  let query = db.collection("integration_secrets") as FirebaseFirestore.Query;
  if (filter.uid) query = query.where("uid", "==", filter.uid);
  if (filter.appId) query = query.where("app_id", "==", filter.appId);
  const results: Record<string, { ok: boolean; error?: string }> = {};
  for (const doc of (await query.get()).docs) {
    results[`${doc.get("app_id")}/${doc.get("provider")}`] = await syncIntegration(db, doc, deps);
  }
  return results;
}

const newKey = (prefix: string) => `${prefix}_${randomBytes(18).toString("base64url")}`;

/**
 * Creates (or replaces) the app's two webhook keys. The public key can only send page
 * views and messages, so it's safe in a web page (tracking snippet, contact form). The
 * secret key can also report sales and chats; keep it on servers.
 */
export async function issueKeys(db: Firestore, uid: string, data: { appId?: unknown }) {
  const appId = await requireApp(db, uid, data.appId);
  const webhookRef = db.doc(statusPath(uid, appId, "webhook"));
  const old = (await webhookRef.get()).data();
  const keys = { public_key: newKey("pub"), secret_key: newKey("sec") };
  const batch = db.batch();
  if (old?.public_key) batch.delete(db.doc(`ingest_keys/${old.public_key}`));
  if (old?.secret_key) batch.delete(db.doc(`ingest_keys/${old.secret_key}`));
  batch.set(db.doc(`ingest_keys/${keys.public_key}`), { uid, app_id: appId, scope: "public" });
  batch.set(db.doc(`ingest_keys/${keys.secret_key}`), { uid, app_id: appId, scope: "secret" });
  batch.set(webhookRef, { provider: "webhook", ...keys, created_at: FieldValue.serverTimestamp() });
  await batch.commit();
  return keys;
}

/** Deletes an app and everything recorded for it. */
export async function deleteApp(db: Firestore, uid: string, data: { appId?: unknown }) {
  const appId = await requireApp(db, uid, data.appId);
  const owned = (collection: string) => db.collection(collection).where("uid", "==", uid).where("app_id", "==", appId).get();
  const mine = (collection: string) => db.collection(`users/${uid}/${collection}`).where("app_id", "==", appId).get();
  const docs = [
    ...(await owned("integration_secrets")).docs,
    ...(await owned("ingest_keys")).docs,
    ...(await mine("inbox")).docs,
    ...(await mine("sales")).docs,
  ];
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await db.recursiveDelete(db.doc(appPath(uid, appId)));
}
