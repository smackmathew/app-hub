// Conversations from Intercom (chats and email), via the REST API with an access token.
import type { Connector, InboxInput, SyncContext } from "../types.js";
import { plainText, requestJson } from "./http.js";

const API = "https://api.intercom.io";
const MAX_PAGES = 10;

function call(ctx: SyncContext, path: string, body?: unknown) {
  return requestJson(ctx.fetch, "Intercom", `${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${ctx.secrets.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Intercom-Version": "2.11",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const intercom: Connector = {
  async verify(ctx) {
    const me = await call(ctx, "/me");
    // Needed to link each conversation to the Intercom inbox.
    return me.app?.id_code ? { workspace_id: String(me.app.id_code) } : undefined;
  },

  async sync(ctx) {
    const inbox: InboxInput[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await call(ctx, "/conversations/search", {
        query: { field: "updated_at", operator: ">", value: Math.floor(ctx.sinceMs / 1000) },
        pagination: { per_page: 50, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      });
      for (const c of response.conversations ?? []) {
        const source = c.source ?? {};
        inbox.push({
          id: String(c.id),
          kind: source.type === "email" ? "message" : "chat",
          from_name: source.author?.name || null,
          from_email: source.author?.email || null,
          subject: plainText(source.subject, 200) || null,
          preview: plainText(source.body),
          url: ctx.config.workspace_id
            ? `https://app.intercom.com/a/inbox/${ctx.config.workspace_id}/inbox/conversation/${c.id}`
            : null,
          closed: c.state === "closed",
          received_at: c.created_at * 1000,
          updated_at: c.updated_at * 1000,
        });
      }
      startingAfter = response.pages?.next?.starting_after;
      if (!startingAfter) break;
    }
    return { inbox };
  },
};
