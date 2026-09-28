import type { Timestamp } from "firebase/firestore";

export interface App {
  id: string;
  name: string;
  url: string | null;
  /** Where it's built or hosted: Claude, Base44, Vercel... */
  platform: string;
  /** Categorical palette slot (0-7); the app keeps its color everywhere. */
  color: number;
  notes?: string;
  created_at?: Timestamp;
}

export interface SourceValues {
  visitors?: number;
  pageviews?: number;
  revenue_cents?: number;
  orders?: number;
}

/** One app's numbers for one day, per source (stripe, plausible, ga4, webhook). */
export interface DailyDoc {
  date: string;
  sources?: Record<string, SourceValues>;
  messages?: number;
  chats?: number;
}

export interface InboxItem {
  id: string;
  app_id: string;
  source: string;
  kind: "message" | "chat";
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  preview: string;
  url: string | null;
  status: "open" | "closed";
  received_at: Timestamp;
  updated_at: Timestamp;
}

export interface Sale {
  id: string;
  app_id: string;
  source: string;
  amount_cents: number;
  currency: string;
  customer_email: string | null;
  description: string | null;
  created_at: Timestamp;
}

export interface IntegrationStatus {
  provider: string;
  config?: Record<string, string>;
  status?: "connected" | "error";
  last_error?: string | null;
  last_sync_at?: Timestamp | null;
  // The "webhook" document holds the app's keys instead.
  public_key?: string;
  secret_key?: string;
}
