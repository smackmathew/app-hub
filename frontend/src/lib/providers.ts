// What the "Connect" forms ask for. Keep in step with functions/src/connectors/index.ts.

export interface Field {
  name: string;
  label: string;
  placeholder?: string;
  optional?: boolean;
  secret?: boolean;
  multiline?: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  group: "traffic" | "sales" | "support";
  blurb: string;
  /** Where to get the credentials. */
  help: string;
  fields: Field[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "plausible",
    name: "Plausible",
    group: "traffic",
    blurb: "Visitors and page views per day.",
    help: "Plausible → Account settings → API keys → New API key (Stats API). The site ID is the domain as it appears in Plausible.",
    fields: [
      { name: "site_id", label: "Site ID", placeholder: "myapp.com" },
      { name: "api_key", label: "Stats API key", secret: true },
      { name: "base_url", label: "Self-hosted address", placeholder: "https://plausible.io", optional: true },
    ],
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    group: "traffic",
    blurb: "Active users and page views per day.",
    help:
      "In Google Cloud, create a service account, enable the Google Analytics Data API, and download a JSON key. In GA, Admin → Property access management → add the service account's email as Viewer. The property ID is under Admin → Property details.",
    fields: [
      { name: "property_id", label: "Property ID", placeholder: "123456789" },
      { name: "service_account_json", label: "Service account key (JSON)", secret: true, multiline: true },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    group: "sales",
    blurb: "Revenue, orders and refunds; each sale in the Sales feed.",
    help:
      "Stripe → Developers → API keys → Create restricted key, with Read access to Balance and Charges (nothing else). One Stripe account per app; if several apps share an account, connect it to one of them.",
    fields: [{ name: "api_key", label: "Restricted key", placeholder: "rk_live_…", secret: true }],
  },
  {
    id: "crisp",
    name: "Crisp",
    group: "support",
    blurb: "Chat conversations, with open/resolved state.",
    help:
      "Create a plugin at marketplace.crisp.chat, add read access to website:conversation:sessions, and copy its production token (identifier + key). The website ID is in Crisp → Settings → Website settings → Setup instructions.",
    fields: [
      { name: "website_id", label: "Website ID" },
      { name: "identifier", label: "Token identifier", secret: true },
      { name: "key", label: "Token key", secret: true },
    ],
  },
  {
    id: "intercom",
    name: "Intercom",
    group: "support",
    blurb: "Chat and email conversations, with open/closed state.",
    help: "Intercom → Settings → Integrations → Developer Hub → your app → Authentication → Access token (needs read conversations).",
    fields: [{ name: "access_token", label: "Access token", secret: true }],
  },
  {
    id: "tawk",
    name: "Tawk.to",
    group: "support",
    blurb: "New chats and tickets, pushed as they happen.",
    help:
      "Tawk.to → Administration → Settings → Webhooks → Create webhook. Use the URL shown below after connecting, tick Chat Start and New Ticket, then paste the webhook's secret key here.",
    fields: [{ name: "webhook_secret", label: "Webhook secret key", secret: true }],
  },
];

export const providerName = (id: string) =>
  PROVIDERS.find((p) => p.id === id)?.name ??
  ({ webhook: "Webhook", form: "Contact form", email: "Email" } as Record<string, string>)[id] ??
  id.charAt(0).toUpperCase() + id.slice(1);

export const PLATFORMS = ["Claude", "Base44", "Lovable", "Bolt", "Replit", "Vercel", "Netlify", "Firebase", "Shopify", "WordPress", "Other"];
