import type { Connector, Provider } from "../types.js";
import { crisp } from "./crisp.js";
import { ga4 } from "./ga4.js";
import { intercom } from "./intercom.js";
import { plausible } from "./plausible.js";
import { stripe } from "./stripe.js";

/** What each provider needs. Tawk has no connector: it pushes events to the webhook instead. */
export const PROVIDERS: Record<Provider, { config: string[]; secrets: string[]; connector: Connector | null }> = {
  stripe: { config: [], secrets: ["api_key"], connector: stripe },
  plausible: { config: ["site_id", "base_url?"], secrets: ["api_key"], connector: plausible },
  ga4: { config: ["property_id"], secrets: ["service_account_json"], connector: ga4 },
  crisp: { config: ["website_id"], secrets: ["identifier", "key"], connector: crisp },
  intercom: { config: [], secrets: ["access_token"], connector: intercom },
  tawk: { config: [], secrets: ["webhook_secret"], connector: null },
};

export const isProvider = (value: unknown): value is Provider => typeof value === "string" && value in PROVIDERS;
