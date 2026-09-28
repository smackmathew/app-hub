import { describe, expect, it } from "vitest";
import { UserError, connectIntegration, deleteApp, disconnectIntegration, issueKeys, syncAll } from "../src/integrations.js";
import { upsertInbox } from "../src/store.js";
import { TZ, db, fakeFetch, newApp } from "./helpers.js";

const NOW = Date.parse("2026-09-10T16:00:00Z");
const sec = (iso: string) => Date.parse(iso) / 1000;

function stripeFetch(transactions: object[]) {
  return fakeFetch([[/balance_transactions/, () => ({ has_more: false, data: transactions })]]);
}

describe("connecting a service", () => {
  it("checks the credentials, keeps them server-side, and runs the first sync", async () => {
    const { uid, appId } = await newApp();
    const fetch = stripeFetch([
      { id: "bt1", type: "charge", amount: 2500, currency: "usd", created: sec("2026-09-09T15:00:00Z"), source: { id: "ch_1", billing_details: { email: "a@example.com" } } },
    ]);
    await connectIntegration(db, uid, { appId, provider: "stripe", secrets: { api_key: " rk_live_1 " } }, { timeZone: TZ, fetch, now: () => NOW });

    const secrets = (await db.doc(`integration_secrets/${uid}__${appId}__stripe`).get()).data()!;
    expect(secrets.secrets).toEqual({ api_key: "rk_live_1" });
    expect(secrets.state).toEqual({ last_synced_day: "2026-09-10", last_synced_at: NOW });

    const status = (await db.doc(`users/${uid}/apps/${appId}/integrations/stripe`).get()).data()!;
    expect(status).toMatchObject({ provider: "stripe", status: "connected", last_error: null });
    expect(JSON.stringify(status)).not.toContain("rk_live_1");

    // First sync covers 90 days: quiet days are recorded as zero.
    const days = await db.collection(`users/${uid}/apps/${appId}/daily`).get();
    expect(days.size).toBe(90);
    expect((await db.doc(`users/${uid}/apps/${appId}/daily/2026-09-09`).get()).get("sources.stripe")).toEqual({ revenue_cents: 2500, orders: 1 });
    const sale = (await db.doc(`users/${uid}/sales/stripe_ch_1`).get()).data()!;
    expect(sale).toMatchObject({ app_id: appId, source: "stripe", amount_cents: 2500, customer_email: "a@example.com" });
  });

  it("rejects bad credentials without storing anything", async () => {
    const { uid, appId } = await newApp();
    const fetch = fakeFetch([[/stripe/, () => new Response("{}", { status: 401 })]]);
    await expect(connectIntegration(db, uid, { appId, provider: "stripe", secrets: { api_key: "bad" } }, { timeZone: TZ, fetch })).rejects.toThrow(
      UserError,
    );
    expect((await db.doc(`integration_secrets/${uid}__${appId}__stripe`).get()).exists).toBe(false);
  });

  it("requires the fields each service needs, and an app the caller owns", async () => {
    const { uid, appId } = await newApp();
    const deps = { timeZone: TZ, fetch: fakeFetch([]) };
    await expect(connectIntegration(db, uid, { appId, provider: "crisp", config: {}, secrets: { identifier: "i", key: "k" } }, deps)).rejects.toThrow(
      "Setting website_id is required",
    );
    await expect(connectIntegration(db, "someone-else", { appId, provider: "stripe", secrets: { api_key: "k" } }, deps)).rejects.toThrow(
      "That app doesn't exist",
    );
    await expect(connectIntegration(db, uid, { appId, provider: "myspace" }, deps)).rejects.toThrow("Unknown service");
  });

  it("stores Tawk's webhook secret without calling anything", async () => {
    const { uid, appId } = await newApp();
    const fetch = fakeFetch([]);
    await connectIntegration(db, uid, { appId, provider: "tawk", secrets: { webhook_secret: "shh" } }, { timeZone: TZ, fetch });
    expect(fetch.calls).toHaveLength(0);
    expect((await db.doc(`users/${uid}/apps/${appId}/integrations/tawk`).get()).get("status")).toBe("connected");
  });

  it("disconnecting removes the credentials", async () => {
    const { uid, appId } = await newApp();
    await connectIntegration(db, uid, { appId, provider: "tawk", secrets: { webhook_secret: "shh" } }, { timeZone: TZ, fetch: fakeFetch([]) });
    await disconnectIntegration(db, uid, { appId, provider: "tawk" });
    expect((await db.doc(`integration_secrets/${uid}__${appId}__tawk`).get()).exists).toBe(false);
    expect((await db.doc(`users/${uid}/apps/${appId}/integrations/tawk`).get()).exists).toBe(false);
  });
});

describe("syncing", () => {
  it("picks up from the day before the last sync and records failures", async () => {
    const { uid, appId } = await newApp();
    await connectIntegration(db, uid, { appId, provider: "stripe", secrets: { api_key: "k" } }, { timeZone: TZ, fetch: stripeFetch([]), now: () => NOW });

    const later = NOW + 3 * 86_400_000;
    const fetch = stripeFetch([]);
    await syncAll(db, { timeZone: TZ, fetch, now: () => later }, { uid });
    expect(decodeURIComponent(fetch.calls[0].url)).toContain(`created[gte]=${sec("2026-09-09T04:00:00Z")}`);

    const failing = fakeFetch([[/stripe/, () => new Response("down", { status: 500 })]]);
    const results = await syncAll(db, { timeZone: TZ, fetch: failing, now: () => later }, { uid });
    expect(results[`${appId}/stripe`]).toEqual({ ok: false, error: "Stripe returned 500: down" });
    expect((await db.doc(`users/${uid}/apps/${appId}/integrations/stripe`).get()).data()).toMatchObject({
      status: "error",
      last_error: "Stripe returned 500: down",
    });
  });

  it("keeps each source's numbers separate on the same day", async () => {
    const { uid, appId } = await newApp();
    await connectIntegration(db, uid, { appId, provider: "stripe", secrets: { api_key: "k" } }, {
      timeZone: TZ,
      fetch: stripeFetch([{ id: "b", type: "charge", amount: 100, currency: "usd", created: sec("2026-09-10T15:00:00Z"), source: { id: "ch" } }]),
      now: () => NOW,
    });
    await connectIntegration(db, uid, { appId, provider: "plausible", config: { site_id: "s" }, secrets: { api_key: "k" } }, {
      timeZone: TZ,
      fetch: fakeFetch([[/plausible/, () => ({ results: [{ dimensions: ["2026-09-10"], metrics: [3, 5] }] })]]),
      now: () => NOW,
    });
    expect((await db.doc(`users/${uid}/apps/${appId}/daily/2026-09-10`).get()).get("sources")).toEqual({
      stripe: { revenue_cents: 100, orders: 1 },
      plausible: { visitors: 3, pageviews: 5 },
    });
  });
});

describe("the inbox", () => {
  const item = (updated: number, closed = false) => ({
    id: "conv/1",
    kind: "chat" as const,
    from_name: "Sam",
    from_email: null,
    subject: null,
    preview: "Hi",
    url: null,
    closed,
    received_at: Date.parse("2026-09-10T15:00:00Z"),
    updated_at: updated,
  });

  it("counts new conversations once, and reopens one you closed when the customer writes again", async () => {
    const { uid, appId } = await newApp();
    expect(await upsertInbox(db, uid, appId, "crisp", item(1000), TZ)).toBe(true);
    expect(await upsertInbox(db, uid, appId, "crisp", item(1000), TZ)).toBe(false);
    const items = await db.collection(`users/${uid}/inbox`).get();
    expect(items.size).toBe(1);
    const ref = items.docs[0].ref;
    expect((await db.doc(`users/${uid}/apps/${appId}/daily/2026-09-10`).get()).get("chats")).toBe(1);

    await ref.update({ status: "closed" });
    await upsertInbox(db, uid, appId, "crisp", item(1000), TZ); // nothing new
    expect((await ref.get()).get("status")).toBe("closed");
    await upsertInbox(db, uid, appId, "crisp", item(2000), TZ); // a new reply
    expect((await ref.get()).get("status")).toBe("open");
    await upsertInbox(db, uid, appId, "crisp", item(3000, true), TZ); // resolved in Crisp
    expect((await ref.get()).get("status")).toBe("closed");
  });
});

describe("webhook keys and deleting an app", () => {
  it("rotating keys retires the old ones; deleting the app removes everything", async () => {
    const { uid, appId } = await newApp();
    const first = await issueKeys(db, uid, { appId });
    const second = await issueKeys(db, uid, { appId });
    expect(first.public_key).toMatch(/^pub_/);
    expect(second.secret_key).toMatch(/^sec_/);
    expect((await db.doc(`ingest_keys/${first.public_key}`).get()).exists).toBe(false);
    expect((await db.doc(`ingest_keys/${second.public_key}`).get()).data()).toEqual({ uid, app_id: appId, scope: "public" });

    await connectIntegration(db, uid, { appId, provider: "tawk", secrets: { webhook_secret: "s" } }, { timeZone: TZ, fetch: fakeFetch([]) });
    await upsertInbox(db, uid, appId, "form", { id: "m", kind: "message", from_name: null, from_email: null, subject: "Hi", preview: "", url: null, closed: false, received_at: NOW, updated_at: NOW }, TZ);
    await db.doc(`users/${uid}/apps/keep`).set({ name: "Other" });
    await upsertInbox(db, uid, "keep", "form", { id: "k", kind: "message", from_name: null, from_email: null, subject: "Keep", preview: "", url: null, closed: false, received_at: NOW, updated_at: NOW }, TZ);

    await deleteApp(db, uid, { appId });
    expect((await db.doc(`users/${uid}/apps/${appId}`).get()).exists).toBe(false);
    expect((await db.collection(`users/${uid}/apps/${appId}/daily`).get()).size).toBe(0);
    expect((await db.doc(`ingest_keys/${second.secret_key}`).get()).exists).toBe(false);
    expect((await db.doc(`integration_secrets/${uid}__${appId}__tawk`).get()).exists).toBe(false);
    const inbox = await db.collection(`users/${uid}/inbox`).get();
    expect(inbox.docs.map((d) => d.get("subject"))).toEqual(["Keep"]);
  });
});
