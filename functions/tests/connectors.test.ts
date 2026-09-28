import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { crisp } from "../src/connectors/crisp.js";
import { ga4 } from "../src/connectors/ga4.js";
import { intercom } from "../src/connectors/intercom.js";
import { plausible } from "../src/connectors/plausible.js";
import { stripe } from "../src/connectors/stripe.js";
import { dayIn, startOfDay } from "../src/dates.js";
import { context, fakeFetch } from "./helpers.js";

const sec = (iso: string) => Date.parse(iso) / 1000;

describe("dates", () => {
  it("buckets instants by the owner's calendar day", () => {
    // 02:00 UTC on Sep 2 is still Sep 1 in New York.
    expect(dayIn("America/New_York", Date.parse("2026-09-02T02:00:00Z"))).toBe("2026-09-01");
    expect(new Date(startOfDay("2026-09-02", "America/New_York")).toISOString()).toBe("2026-09-02T04:00:00.000Z");
    expect(new Date(startOfDay("2026-01-15", "America/New_York")).toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });
});

describe("Stripe", () => {
  it("totals charges minus refunds per day, across pages", async () => {
    const fetch = fakeFetch([
      [
        /balance_transactions/,
        (url) =>
          url.includes("starting_after=bt2")
            ? {
                has_more: false,
                data: [{ id: "bt3", type: "refund", amount: -500, currency: "usd", created: sec("2026-09-03T15:00:00Z"), source: "re_1" }],
              }
            : {
                has_more: true,
                data: [
                  {
                    id: "bt1",
                    type: "charge",
                    amount: 1999,
                    currency: "usd",
                    created: sec("2026-09-01T15:00:00Z"),
                    source: { id: "ch_1", billing_details: { email: "a@example.com" }, description: "Pro plan" },
                  },
                  // 01:00 UTC on Sep 3 is Sep 2 in New York.
                  { id: "bt2", type: "payment", amount: 500, currency: "usd", created: sec("2026-09-03T01:00:00Z"), source: { id: "py_2", receipt_email: "b@example.com" } },
                ],
              },
      ],
    ]);
    const result = await stripe.sync(context({ fetch, secrets: { api_key: "rk_test" } }));
    expect(result.daily).toEqual({
      "2026-09-01": { revenue_cents: 1999, orders: 1 },
      "2026-09-02": { revenue_cents: 500, orders: 1 },
      "2026-09-03": { revenue_cents: -500, orders: 0 },
    });
    expect(result.sales).toEqual([
      expect.objectContaining({ id: "ch_1", amount_cents: 1999, customer_email: "a@example.com", description: "Pro plan" }),
      expect.objectContaining({ id: "py_2", amount_cents: 500, customer_email: "b@example.com" }),
    ]);
    expect(fetch.calls[0].url).toContain(`created%5Bgte%5D=${startOfDay("2026-09-01", "America/New_York") / 1000}`);
    expect((fetch.calls[0].init.headers as any).Authorization).toBe("Bearer rk_test");
  });

  it("reports Stripe's error when the key is wrong", async () => {
    const fetch = fakeFetch([[/stripe/, () => new Response('{"error":{"message":"Invalid API Key"}}', { status: 401 })]]);
    await expect(stripe.verify(context({ fetch, secrets: { api_key: "nope" } }))).rejects.toThrow(/Stripe returned 401: .*Invalid API Key/);
  });
});

describe("Plausible", () => {
  it("reads visitors and page views per day, filling quiet days with zeros", async () => {
    const fetch = fakeFetch([
      [/example\.org\/api\/v2\/query/, () => ({ results: [{ dimensions: ["2026-09-02"], metrics: [12, 40] }] })],
    ]);
    const result = await plausible.sync(context({ fetch, config: { site_id: "recipes.app", base_url: "https://example.org/" }, secrets: { api_key: "k" } }));
    expect(result.daily).toEqual({
      "2026-09-01": { visitors: 0, pageviews: 0 },
      "2026-09-02": { visitors: 12, pageviews: 40 },
      "2026-09-03": { visitors: 0, pageviews: 0 },
    });
    expect(JSON.parse(fetch.calls[0].init.body as string)).toMatchObject({ site_id: "recipes.app", date_range: ["2026-09-01", "2026-09-03"] });
  });
});

describe("Google Analytics 4", () => {
  it("signs in with the service account and reads the daily report", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const account = { client_email: "hub@proj.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
    let assertionValid = false;
    const fetch = fakeFetch([
      [
        /oauth2\.googleapis\.com\/token/,
        (_url, init) => {
          const assertion = new URLSearchParams(init.body as string).get("assertion")!;
          const [header, claims, signature] = assertion.split(".");
          assertionValid = createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url"));
          expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({ iss: account.client_email });
          return { access_token: "ya29.token" };
        },
      ],
      [
        /properties\/123:runReport/,
        (_url, init) => {
          expect((init.headers as any).Authorization).toBe("Bearer ya29.token");
          return { rows: [{ dimensionValues: [{ value: "20260903" }], metricValues: [{ value: "7" }, { value: "19" }] }] };
        },
      ],
    ]);
    const result = await ga4.sync(context({ fetch, config: { property_id: "properties/123" }, secrets: { service_account_json: JSON.stringify(account) } }));
    expect(assertionValid).toBe(true);
    expect(result.daily!["2026-09-03"]).toEqual({ visitors: 7, pageviews: 19 });
    expect(result.daily!["2026-09-01"]).toEqual({ visitors: 0, pageviews: 0 });
  });

  it("explains a malformed key", async () => {
    const fetch = fakeFetch([]);
    await expect(ga4.verify(context({ fetch, config: { property_id: "1" }, secrets: { service_account_json: "{" } }))).rejects.toThrow(/isn't valid JSON/);
  });
});

describe("Crisp", () => {
  it("reads conversations active since the last sync", async () => {
    const since = Date.parse("2026-09-01T00:00:00Z");
    const fetch = fakeFetch([
      [
        /conversations\/1/,
        () => ({
          data: [
            { session_id: "session_a", state: "unresolved", meta: { nickname: "Sam", email: "sam@example.com" }, last_message: "Where is my order?", created_at: since + 5000, updated_at: since + 9000 },
            { session_id: "session_b", state: "resolved", meta: { nickname: "Old" }, last_message: "thanks", created_at: since - 9000, updated_at: since - 5000 },
          ],
        }),
      ],
    ]);
    const result = await crisp.sync(context({ fetch, config: { website_id: "w1" }, secrets: { identifier: "id", key: "key" }, sinceMs: since }));
    expect(result.inbox).toEqual([
      expect.objectContaining({ id: "session_a", kind: "chat", from_name: "Sam", preview: "Where is my order?", closed: false, url: "https://app.crisp.chat/website/w1/inbox/session_a/" }),
    ]);
    // Stopped after page 1 because it reached conversations older than the window.
    expect(fetch.calls).toHaveLength(1);
    expect((fetch.calls[0].init.headers as any).Authorization).toBe(`Basic ${Buffer.from("id:key").toString("base64")}`);
  });
});

describe("Intercom", () => {
  it("stores the workspace ID when connecting and pages through conversations", async () => {
    const fetch = fakeFetch([
      [/\/me$/, () => ({ app: { id_code: "abc123" } })],
      [
        /conversations\/search/,
        (_url, init) =>
          JSON.parse(init.body as string).pagination.starting_after
            ? { conversations: [{ id: "2", state: "closed", created_at: 100, updated_at: 200, source: { type: "email", subject: "<p>Refund</p>", body: "<p>Hi&nbsp;there</p>", author: { email: "c@example.com" } } }] }
            : { conversations: [{ id: "1", state: "open", created_at: 100, updated_at: 150, source: { type: "conversation", body: "Hello", author: { name: "Dee" } } }], pages: { next: { starting_after: "cursor" } } },
      ],
    ]);
    const ctx = context({ fetch, secrets: { access_token: "t" } });
    expect(await intercom.verify(ctx)).toEqual({ workspace_id: "abc123" });
    const result = await intercom.sync({ ...ctx, config: { workspace_id: "abc123" } });
    expect(result.inbox).toEqual([
      expect.objectContaining({ id: "1", kind: "chat", from_name: "Dee", preview: "Hello", closed: false, url: "https://app.intercom.com/a/inbox/abc123/inbox/conversation/1" }),
      expect.objectContaining({ id: "2", kind: "message", subject: "Refund", preview: "Hi there", closed: true, received_at: 100_000, updated_at: 200_000 }),
    ]);
  });
});
