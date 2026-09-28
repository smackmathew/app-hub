// The shapes connectors produce and the store writes. See firestore.rules for the stored documents.

export type Provider = "stripe" | "plausible" | "ga4" | "crisp" | "intercom" | "tawk";
export type InboxKind = "message" | "chat";

/** One day's numbers from one source. Missing fields mean "this source doesn't report that". */
export interface DailyValues {
  visitors?: number;
  pageviews?: number;
  revenue_cents?: number;
  orders?: number;
}

export interface SaleInput {
  /** Stable ID from the source, so syncing again updates rather than duplicates. */
  id: string;
  amount_cents: number;
  currency: string;
  customer_email: string | null;
  description: string | null;
  created_at: number; // ms
}

export interface InboxInput {
  id: string;
  kind: InboxKind;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  preview: string;
  url: string | null;
  /** Whether the source considers it resolved. */
  closed: boolean;
  received_at: number; // ms
  updated_at: number; // ms
}

export interface SyncResult {
  /** Complete numbers for each day in the sync window (a day with no activity is all zeros). */
  daily?: Record<string, DailyValues>;
  sales?: SaleInput[];
  inbox?: InboxInput[];
}

export interface SyncContext {
  config: Record<string, string>;
  secrets: Record<string, string>;
  /** First and last day to fetch daily numbers for, in the owner's time zone. */
  from: string;
  to: string;
  /** Fetch conversations updated since this instant (ms). */
  sinceMs: number;
  timeZone: string;
  fetch: typeof fetch;
}

export interface Connector {
  /** Checks the credentials work. May return extra (non-secret) config to store, e.g. a workspace ID. */
  verify(ctx: SyncContext): Promise<Record<string, string> | void>;
  sync(ctx: SyncContext): Promise<SyncResult>;
}
