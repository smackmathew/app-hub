// Writes connector and webhook results into the owner's data (layout: see firestore.rules).
import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { dayIn } from "./dates.js";
import type { DailyValues, InboxInput, SaleInput } from "./types.js";

/** Where an item came from: a connected provider, or a label sent to the webhook ("form", "email", ...). */
export type Source = string;

/** A Firestore-safe document ID derived from the source and its own ID. */
export function docId(source: Source, externalId: string): string {
  const raw = `${source}_${externalId}`;
  if (/^[A-Za-z0-9_.-]{1,200}$/.test(raw) && !raw.startsWith("__")) return raw;
  return `${source}_${createHash("sha256").update(externalId).digest("hex").slice(0, 32)}`;
}

export const appPath = (uid: string, appId: string) => `users/${uid}/apps/${appId}`;
const dailyPath = (uid: string, appId: string, day: string) => `${appPath(uid, appId)}/daily/${day}`;

/** Replaces one source's numbers for each given day, leaving other sources' numbers alone. */
export async function writeDaily(db: Firestore, uid: string, appId: string, source: Source, daily: Record<string, DailyValues>) {
  const entries = Object.entries(daily);
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [day, values] of entries.slice(i, i + 400)) {
      batch.set(db.doc(dailyPath(uid, appId, day)), { date: day, sources: { [source]: values } }, { merge: true });
    }
    await batch.commit();
  }
}

/** Adds to one source's numbers for a day (webhook events arrive one at a time). */
export async function incrementDaily(db: Firestore, uid: string, appId: string, source: Source, day: string, values: DailyValues) {
  const increments = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, FieldValue.increment(v ?? 0)]));
  await db.doc(dailyPath(uid, appId, day)).set({ date: day, sources: { [source]: increments } }, { merge: true });
}

export async function writeSales(db: Firestore, uid: string, appId: string, source: Source, sales: SaleInput[]) {
  for (let i = 0; i < sales.length; i += 400) {
    const batch = db.batch();
    for (const sale of sales.slice(i, i + 400)) {
      batch.set(db.doc(`users/${uid}/sales/${docId(source, sale.id)}`), {
        app_id: appId,
        source,
        amount_cents: sale.amount_cents,
        currency: sale.currency.toLowerCase(),
        customer_email: sale.customer_email,
        description: sale.description,
        created_at: Timestamp.fromMillis(sale.created_at),
      });
    }
    await batch.commit();
  }
}

/**
 * Adds or updates a message/chat in the inbox. A new item counts toward that day's messages
 * or chats. When the source reports newer activity, the item takes the source's open/closed
 * state (so a customer reply reopens something you marked done); otherwise the state you set
 * here is kept. Returns whether the item was new.
 */
export async function upsertInbox(
  db: Firestore,
  uid: string,
  appId: string,
  source: Source,
  item: InboxInput,
  timeZone: string,
): Promise<boolean> {
  const ref = db.doc(`users/${uid}/inbox/${docId(source, item.id)}`);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const fields = {
      app_id: appId,
      source,
      kind: item.kind,
      from_name: item.from_name,
      from_email: item.from_email,
      subject: item.subject,
      preview: item.preview,
      url: item.url,
      received_at: Timestamp.fromMillis(item.received_at),
      updated_at: Timestamp.fromMillis(item.updated_at),
    };
    const status = item.closed ? "closed" : "open";
    if (!existing.exists) {
      tx.set(ref, { ...fields, status });
      const counter = item.kind === "chat" ? "chats" : "messages";
      tx.set(
        db.doc(dailyPath(uid, appId, dayIn(timeZone, item.received_at))),
        { date: dayIn(timeZone, item.received_at), [counter]: FieldValue.increment(1) },
        { merge: true },
      );
      return true;
    }
    const previous = (existing.get("updated_at") as Timestamp | undefined)?.toMillis() ?? 0;
    if (item.updated_at > previous) tx.update(ref, { ...fields, status });
    return false;
  });
}
