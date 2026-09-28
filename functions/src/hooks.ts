// The webhook your apps (and Tawk.to) send events to. Served at /hooks/... on your Hosting
// domain (see firebase.json):
//
//   POST /hooks/ingest/<key>   messages, contact forms, emails, chats, sales, page views
//   POST /hooks/tawk/<public key>   Tawk.to's webhooks (signed with the secret you gave Tawk)
//
// The README documents the payloads.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { dayIn } from "./dates.js";
import { secretsId } from "./integrations.js";
import { docId, incrementDaily, upsertInbox } from "./store.js";
import type { InboxInput } from "./types.js";

export interface HookRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody?: Buffer;
}

export interface HookResponse {
  status: number;
  headers?: Record<string, string>;
  body: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (status: number, body: object): HookResponse => ({
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const header = (req: HookRequest, name: string) => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value ?? "";
};

/** A trimmed string field, or null. */
function str(body: Record<string, unknown>, name: string, max: number): string | null {
  const value = body[name];
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function parseBody(req: HookRequest): Record<string, unknown> | null {
  let body = req.body;
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(body.toString());
    } catch {
      return null;
    }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export async function handleHook(db: Firestore, req: HookRequest, timeZone: string, now = Date.now()): Promise<HookResponse> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS, body: "" };
  if (req.method !== "POST") return json(405, { error: "Use POST" });

  const segments = req.path.split("/").filter(Boolean);
  const routeAt = segments.findIndex((s) => s === "ingest" || s === "tawk");
  const route = segments[routeAt];
  const key = segments[routeAt + 1];
  if (routeAt < 0 || !key) return json(404, { error: "Not found" });

  const keyDoc = await db.doc(`ingest_keys/${key.replace(/\//g, "")}`).get();
  if (!keyDoc.exists) return json(404, { error: "Unknown key" });
  const { uid, app_id: appId, scope } = keyDoc.data() as { uid: string; app_id: string; scope: "public" | "secret" };

  return route === "tawk" ? handleTawk(db, req, uid, appId, timeZone, now) : handleIngest(db, req, uid, appId, scope, timeZone, now);
}

async function handleIngest(
  db: Firestore,
  req: HookRequest,
  uid: string,
  appId: string,
  scope: "public" | "secret",
  timeZone: string,
  now: number,
): Promise<HookResponse> {
  const isForm = /application\/x-www-form-urlencoded/i.test(header(req, "content-type"));
  const body = parseBody(req);
  if (!body) return json(400, { error: "Send a JSON object or a form" });

  const redirect = str(body, "_redirect", 2000);
  const done = (): HookResponse => {
    if (!isForm) return json(200, { ok: true });
    if (redirect && /^https?:\/\//i.test(redirect)) return { status: 303, headers: { Location: redirect }, body: "" };
    return {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: '<!doctype html><meta name="viewport" content="width=device-width"><title>Thanks</title><p style="font:16px system-ui;margin:3rem auto;max-width:30rem">Thanks, your message was sent. You can close this page.</p>',
    };
  };

  // Honeypot: a hidden form field that people leave empty and spam bots fill in.
  if (str(body, "_gotcha", 10)) return done();

  const type = (str(body, "type", 20) ?? "message").toLowerCase();
  if ((type === "sale" || type === "chat") && scope !== "secret") {
    return json(403, { error: `Reporting a ${type} needs the app's secret key` });
  }
  const day = dayIn(timeZone, now);

  if (type === "pageview") {
    await incrementDaily(db, uid, appId, "webhook", day, { pageviews: 1, visitors: body.new_visitor === true || body.new_visitor === "true" ? 1 : 0 });
    return done();
  }

  if (type === "sale") {
    const cents =
      typeof body.amount_cents === "number" ? Math.round(body.amount_cents) : typeof body.amount === "number" ? Math.round(body.amount * 100) : NaN;
    if (!Number.isFinite(cents)) return json(400, { error: "A sale needs amount (e.g. 19.99) or amount_cents (e.g. 1999)" });
    const id = str(body, "id", 200);
    const saleRef = db.doc(`users/${uid}/sales/${docId("webhook", id ?? randomUUID())}`);
    const dailyRef = db.doc(`users/${uid}/apps/${appId}/daily/${day}`);
    // With an ID, sending the same sale twice doesn't count it twice.
    await db.runTransaction(async (tx) => {
      if ((await tx.get(saleRef)).exists) return;
      tx.set(saleRef, {
        app_id: appId,
        source: "webhook",
        amount_cents: cents,
        currency: (str(body, "currency", 3) ?? "usd").toLowerCase(),
        customer_email: str(body, "email", 200),
        description: str(body, "description", 300),
        created_at: Timestamp.fromMillis(now),
      });
      tx.set(
        dailyRef,
        { date: day, sources: { webhook: { revenue_cents: FieldValue.increment(cents), orders: FieldValue.increment(cents > 0 ? 1 : 0) } } },
        { merge: true },
      );
    });
    return done();
  }

  if (type === "message" || type === "email" || type === "chat") {
    const message = str(body, "message", 5000) ?? str(body, "body", 5000) ?? str(body, "text", 5000);
    const subject = str(body, "subject", 200);
    if (!message && !subject) return json(400, { error: "A message needs message or subject" });
    const source = (str(body, "source", 30) ?? (type === "email" ? "email" : isForm ? "form" : "webhook")).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const item: InboxInput = {
      id: str(body, "id", 200) ?? randomUUID(),
      kind: type === "chat" ? "chat" : "message",
      from_name: str(body, "name", 200),
      from_email: str(body, "email", 200) ?? str(body, "from", 200),
      subject,
      preview: message ?? "",
      url: /^https?:\/\//i.test(str(body, "url", 2000) ?? "") ? str(body, "url", 2000) : null,
      closed: false,
      received_at: now,
      updated_at: now,
    };
    await upsertInbox(db, uid, appId, source || "webhook", item, timeZone);
    return done();
  }

  return json(400, { error: `Unknown type "${type}". Use message, email, chat, sale or pageview.` });
}

async function handleTawk(db: Firestore, req: HookRequest, uid: string, appId: string, timeZone: string, now: number): Promise<HookResponse> {
  const secretsDoc = await db.doc(`integration_secrets/${secretsId(uid, appId, "tawk")}`).get();
  const secret: string | undefined = secretsDoc.get("secrets.webhook_secret");
  if (!secret) return json(404, { error: "Tawk.to isn't connected to this app" });

  const signature = header(req, "x-tawk-signature");
  const expected = createHmac("sha1", secret).update(req.rawBody ?? Buffer.from("")).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return json(401, { error: "Bad signature" });
  }

  const body = parseBody(req) as any;
  const at = Date.parse(body?.time ?? "") || now;
  let item: InboxInput | null = null;
  if (body?.event === "chat:start") {
    item = {
      id: String(body.chatId),
      kind: "chat",
      from_name: body.visitor?.name ?? null,
      from_email: body.visitor?.email ?? null,
      subject: null,
      preview: String(body.message?.text ?? "").slice(0, 5000),
      url: "https://dashboard.tawk.to/",
      closed: false,
      received_at: at,
      updated_at: at,
    };
  } else if (body?.event === "ticket:create") {
    item = {
      id: String(body.ticket?.id ?? randomUUID()),
      kind: "message",
      from_name: body.requester?.name ?? null,
      from_email: body.requester?.email ?? null,
      subject: body.ticket?.subject ? String(body.ticket.subject).slice(0, 200) : null,
      preview: String(body.ticket?.message ?? "").slice(0, 5000),
      url: "https://dashboard.tawk.to/",
      closed: false,
      received_at: at,
      updated_at: at,
    };
  }
  // Other events (e.g. chat:end) are acknowledged and ignored.
  if (item) await upsertInbox(db, uid, appId, "tawk", item, timeZone);
  return json(200, { ok: true });
}
