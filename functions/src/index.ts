import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { handleHook } from "./hooks.js";
import { UserError, connectIntegration, deleteApp, disconnectIntegration, issueKeys, syncAll, type Deps } from "./integrations.js";

initializeApp();
const db = getFirestore();

// Set in functions/.env (see functions/.env.example).
const timeZone = defineString("TIME_ZONE", { default: "America/New_York" });
const deps = (): Deps => ({ timeZone: timeZone.value(), fetch });

function callerUid(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first");
  return request.auth.uid;
}

/** Runs `work`, turning a UserError into an error message the web app can show. */
async function userFacing<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof UserError) throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
}

// Connecting runs the first sync, which can take a while for a busy Stripe account.
const LONG = { timeoutSeconds: 300 };

export const connectService = onCall(LONG, (request) =>
  userFacing(() => connectIntegration(db, callerUid(request), request.data ?? {}, deps())),
);

export const disconnectService = onCall((request) => userFacing(() => disconnectIntegration(db, callerUid(request), request.data ?? {})));

export const syncNow = onCall(LONG, async (request) => {
  const uid = callerUid(request);
  const appId = typeof request.data?.appId === "string" ? request.data.appId : undefined;
  return syncAll(db, deps(), { uid, appId });
});

export const issueWebhookKeys = onCall((request) => userFacing(() => issueKeys(db, callerUid(request), request.data ?? {})));

export const removeApp = onCall(LONG, (request) => userFacing(() => deleteApp(db, callerUid(request), request.data ?? {})));

/** Every hour: pull new numbers and conversations from every connected service. */
export const hourlySync = onSchedule({ schedule: "every 60 minutes", timeoutSeconds: 540 }, async () => {
  const results = await syncAll(db, deps());
  for (const [key, result] of Object.entries(results)) {
    if (!result.ok) logger.warn(`Sync failed for ${key}: ${result.error}`);
  }
});

export const hooks = onRequest({ cors: false }, async (req, res) => {
  try {
    const response = await handleHook(db, req, timeZone.value());
    res.status(response.status).set(response.headers ?? {}).send(response.body);
  } catch (error) {
    logger.error("Webhook failed", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});
