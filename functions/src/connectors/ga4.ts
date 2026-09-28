// Traffic from Google Analytics 4, via the Analytics Data API with a service account.
// The service account's email must be added to the GA property (Viewer is enough).
import { createSign } from "node:crypto";
import { daysBetween } from "../dates.js";
import type { Connector, DailyValues, SyncContext } from "../types.js";
import { requestJson, zeroDays } from "./http.js";

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const base64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function parseServiceAccount(json: string): ServiceAccount {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The service account key isn't valid JSON. Paste the whole downloaded .json file.");
  }
  if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
    throw new Error("The service account key is missing client_email or private_key.");
  }
  return parsed;
}

async function accessToken(ctx: SyncContext): Promise<string> {
  const account = parseServiceAccount(ctx.secrets.service_account_json);
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key);
  const response = await requestJson(ctx.fetch, "Google sign-in", tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    }).toString(),
  });
  return response.access_token;
}

async function runReport(ctx: SyncContext, from: string, to: string) {
  const token = await accessToken(ctx);
  const propertyId = ctx.config.property_id.replace(/^properties\//, "");
  return requestJson(ctx.fetch, "Google Analytics", `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
      limit: 1000,
    }),
  });
}

export const ga4: Connector = {
  async verify(ctx) {
    await runReport(ctx, ctx.to, ctx.to);
  },

  async sync(ctx) {
    const daily = zeroDays<DailyValues>(daysBetween(ctx.from, ctx.to), () => ({ visitors: 0, pageviews: 0 }));
    const report = await runReport(ctx, ctx.from, ctx.to);
    for (const row of report.rows ?? []) {
      const raw: string = row.dimensionValues[0].value; // YYYYMMDD
      const day = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      if (!daily[day]) continue;
      daily[day] = { visitors: Number(row.metricValues[0].value) || 0, pageviews: Number(row.metricValues[1].value) || 0 };
    }
    return { daily };
  },
};
