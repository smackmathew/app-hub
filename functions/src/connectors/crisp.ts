// Support chats from Crisp, via the REST API with a plugin token (identifier + key).
import type { Connector, InboxInput, SyncContext } from "../types.js";
import { plainText, requestJson } from "./http.js";

const MAX_PAGES = 10;

function listPage(ctx: SyncContext, page: number) {
  const auth = Buffer.from(`${ctx.secrets.identifier}:${ctx.secrets.key}`).toString("base64");
  return requestJson(
    ctx.fetch,
    "Crisp",
    `https://api.crisp.chat/v1/website/${encodeURIComponent(ctx.config.website_id)}/conversations/${page}?per_page=50`,
    { headers: { Authorization: `Basic ${auth}`, "X-Crisp-Tier": "plugin" } },
  );
}

export const crisp: Connector = {
  async verify(ctx) {
    await listPage(ctx, 1);
  },

  async sync(ctx) {
    const inbox: InboxInput[] = [];
    // Conversations come most recently active first; stop once they're older than the window.
    for (let page = 1; page <= MAX_PAGES; page++) {
      const conversations: any[] = (await listPage(ctx, page)).data ?? [];
      for (const c of conversations) {
        const updatedAt = Number(c.updated_at ?? c.created_at);
        if (updatedAt < ctx.sinceMs) continue;
        inbox.push({
          id: c.session_id,
          kind: "chat",
          from_name: c.meta?.nickname || null,
          from_email: c.meta?.email || null,
          subject: c.meta?.subject || null,
          preview: plainText(typeof c.last_message === "string" ? c.last_message : ""),
          url: `https://app.crisp.chat/website/${ctx.config.website_id}/inbox/${c.session_id}/`,
          closed: c.state === "resolved",
          received_at: Number(c.created_at),
          updated_at: updatedAt,
        });
      }
      const oldest = conversations[conversations.length - 1];
      if (!oldest || Number(oldest.updated_at ?? oldest.created_at) < ctx.sinceMs) break;
    }
    return { inbox };
  },
};
