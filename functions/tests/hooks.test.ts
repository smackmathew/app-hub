import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { handleHook, type HookRequest } from "../src/hooks.js";
import { connectIntegration, issueKeys } from "../src/integrations.js";
import { TZ, db, fakeFetch, newApp } from "./helpers.js";

const NOW = Date.parse("2026-09-10T16:00:00Z");
let uid: string, appId: string, keys: { public_key: string; secret_key: string };

beforeEach(async () => {
  ({ uid, appId } = await newApp());
  keys = await issueKeys(db, uid, { appId });
});

const post = (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }): HookRequest => ({
  method: "POST",
  path,
  headers,
  body,
  rawBody: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
});
const send = (req: HookRequest) => handleHook(db, req, TZ, NOW);
const daily = async () => (await db.doc(`users/${uid}/apps/${appId}/daily/2026-09-10`).get()).data();
const inbox = async () => (await db.collection(`users/${uid}/inbox`).get()).docs.map((d) => d.data());

describe("the ingest webhook", () => {
  it("takes a plain HTML contact form and redirects back", async () => {
    const res = await send(
      post(
        `/hooks/ingest/${keys.public_key}`,
        { name: "Sam", email: "sam@example.com", message: "Love the app!", _redirect: "https://recipes.app/thanks" },
        { "content-type": "application/x-www-form-urlencoded" },
      ),
    );
    expect(res).toMatchObject({ status: 303, headers: { Location: "https://recipes.app/thanks" } });
    expect(await inbox()).toEqual([
      expect.objectContaining({ app_id: appId, source: "form", kind: "message", from_name: "Sam", from_email: "sam@example.com", preview: "Love the app!", status: "open" }),
    ]);
    expect((await daily())!.messages).toBe(1);
  });

  it("quietly drops spam that fills in the honeypot", async () => {
    const res = await send(post(`/hooks/ingest/${keys.public_key}`, { message: "buy now", _gotcha: "x" }, { "content-type": "application/x-www-form-urlencoded" }));
    expect(res.status).toBe(200);
    expect(await inbox()).toEqual([]);
  });

  it("counts page views sent as text by navigator.sendBeacon", async () => {
    await send(post(`/hooks/ingest/${keys.public_key}`, JSON.stringify({ type: "pageview", new_visitor: true }), { "content-type": "text/plain" }));
    await send(post(`/hooks/ingest/${keys.public_key}`, JSON.stringify({ type: "pageview" }), { "content-type": "text/plain" }));
    expect((await daily())!.sources.webhook).toEqual({ pageviews: 2, visitors: 1 });
  });

  it("only takes sales with the secret key, and counts a repeated sale once", async () => {
    const sale = { type: "sale", id: "order-1", amount: 19.99, email: "b@example.com" };
    expect((await send(post(`/hooks/ingest/${keys.public_key}`, sale))).status).toBe(403);
    expect((await send(post(`/hooks/ingest/${keys.secret_key}`, sale))).status).toBe(200);
    expect((await send(post(`/hooks/ingest/${keys.secret_key}`, sale))).status).toBe(200);
    expect((await daily())!.sources.webhook).toEqual({ revenue_cents: 1999, orders: 1 });
    const sales = await db.collection(`users/${uid}/sales`).get();
    expect(sales.docs.map((d) => d.data())).toEqual([expect.objectContaining({ amount_cents: 1999, customer_email: "b@example.com", currency: "usd" })]);
  });

  it("files forwarded emails under their own source", async () => {
    await send(post(`/hooks/ingest/${keys.public_key}`, { type: "email", from: "c@example.com", subject: "Invoice?", message: "Hi" }));
    expect(await inbox()).toEqual([expect.objectContaining({ source: "email", kind: "message", from_email: "c@example.com", subject: "Invoice?" })]);
  });

  it("rejects unknown keys, other methods and junk", async () => {
    expect((await send(post("/hooks/ingest/pub_nope", { message: "hi" }))).status).toBe(404);
    expect((await send({ method: "GET", path: `/hooks/ingest/${keys.public_key}`, headers: {}, body: undefined })).status).toBe(405);
    expect((await send(post(`/hooks/ingest/${keys.public_key}`, "not json", { "content-type": "text/plain" }))).status).toBe(400);
    expect((await send(post(`/hooks/ingest/${keys.public_key}`, { type: "message" }))).status).toBe(400);
    expect((await send({ method: "OPTIONS", path: `/hooks/ingest/${keys.public_key}`, headers: {}, body: undefined })).status).toBe(204);
  });
});

describe("the Tawk.to webhook", () => {
  const chatStart = {
    event: "chat:start",
    chatId: "chat-9",
    time: "2026-09-10T15:00:00.000Z",
    message: { text: "Is there a free trial?", type: "msg", sender: { type: "visitor" } },
    visitor: { name: "Robin", email: "robin@example.com" },
    property: { id: "p", name: "Recipes" },
  };
  const signed = (secret: string) => {
    const raw = JSON.stringify(chatStart);
    return post(`/hooks/tawk/${keys.public_key}`, chatStart, {
      "content-type": "application/json",
      "x-tawk-signature": createHmac("sha1", secret).update(raw).digest("hex"),
    });
  };

  it("adds a new chat when the signature matches", async () => {
    await connectIntegration(db, uid, { appId, provider: "tawk", secrets: { webhook_secret: "tawk-secret" } }, { timeZone: TZ, fetch: fakeFetch([]) });
    expect((await send(signed("wrong"))).status).toBe(401);
    expect(await inbox()).toEqual([]);
    expect((await send(signed("tawk-secret"))).status).toBe(200);
    expect(await inbox()).toEqual([expect.objectContaining({ source: "tawk", kind: "chat", from_name: "Robin", preview: "Is there a free trial?" })]);
  });

  it("refuses events until Tawk.to is connected", async () => {
    expect((await send(signed("anything"))).status).toBe(404);
  });
});
