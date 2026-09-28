// Ready-to-paste code for sending an app's traffic, messages and sales to its webhook.
import { useState } from "react";
import { AppsApi, errorMessage } from "../data/api";
import { HOOKS_URL } from "../firebase";
import CopyField from "./CopyField";

function Code({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-page p-3 text-xs leading-5">
        <code>{code}</code>
      </pre>
      <button
        className="btn-ghost absolute right-2 top-2 bg-surface py-1 text-xs"
        onClick={async () => {
          await navigator.clipboard.writeText(code).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const TABS = ["Traffic snippet", "Contact form", "Email", "From your server"] as const;

export default function Snippets({ appId, appUrl, keys }: { appId: string; appUrl: string | null; keys: { public_key?: string; secret_key?: string } | undefined }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function issue(rotate: boolean) {
    if (rotate && !confirm("Make new keys? Anything using the current keys (snippets, forms, servers) stops working until you update it.")) return;
    setBusy(true);
    try {
      await AppsApi.issueKeys(appId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!keys?.public_key || !keys.secret_key) {
    return (
      <div className="card p-4 text-sm">
        <p className="text-ink-2">This app has no webhook keys yet.</p>
        <button className="btn-primary mt-3" onClick={() => issue(false)} disabled={busy}>
          Create keys
        </button>
        {error && <p className="mt-2 text-[color:var(--bad)]">{error}</p>}
      </div>
    );
  }

  const pub = `${HOOKS_URL}/ingest/${keys.public_key}`;
  const sec = `${HOOKS_URL}/ingest/${keys.secret_key}`;
  const thanks = appUrl ? `${appUrl.replace(/\/$/, "")}/thanks` : "https://yourapp.com/thanks";

  const code: Record<(typeof TABS)[number], { intro: string; code: string }> = {
    "Traffic snippet": {
      intro:
        "Counts page views and daily visitors, with no cookies. Paste it before </body> on every page. Skip this if the app has Plausible or Google Analytics connected: those numbers are used instead. Single-page apps: call it again on each route change.",
      code: `<script>
(function () {
  var seen = false, today = new Date().toDateString();
  try { seen = localStorage.getItem("apphub_day") === today; localStorage.setItem("apphub_day", today); } catch (e) {}
  navigator.sendBeacon("${pub}",
    JSON.stringify({ type: "pageview", path: location.pathname, new_visitor: !seen }));
})();
</script>`,
    },
    "Contact form": {
      intro:
        "A plain HTML form that posts straight to your inbox here, with no backend needed. The hidden _gotcha field catches spam bots; _redirect is where people land after sending. From JavaScript, POST the same fields as JSON instead.",
      code: `<form action="${pub}" method="POST">
  <input name="name" placeholder="Your name">
  <input name="email" type="email" placeholder="Your email" required>
  <input name="subject" placeholder="Subject">
  <textarea name="message" placeholder="How can we help?" required></textarea>
  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="_redirect" value="${thanks}">
  <button type="submit">Send</button>
</form>`,
    },
    Email: {
      intro:
        "To see emails sent to e.g. support@yourapp.com, route that address to a Cloudflare Email Worker (Email → Email Routing → Routes → Send to a Worker) with this code (npm install postal-mime). It still forwards each email to your real mailbox. Zapier or Make can do the same: POST type, from, subject and message as JSON to the URL below.",
      code: `import PostalMime from "postal-mime";

export default {
  async email(message, env, ctx) {
    const email = await PostalMime.parse(message.raw);
    await fetch("${pub}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "email",
        from: message.from,
        name: email.from?.name,
        subject: email.subject,
        message: (email.text || "").slice(0, 5000),
      }),
    });
    await message.forward("you@example.com"); // keep a copy in your inbox
  },
};`,
    },
    "From your server": {
      intro:
        "Report sales from a payment provider other than Stripe (Gumroad, Lemon Squeezy, PayPal, your own backend), or chats from any other tool. This uses the secret key: keep it on servers only. Sending the same id twice counts once.",
      code: `# A sale (amount in dollars, or amount_cents)
curl -X POST "${sec}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"sale","id":"order_1042","amount":29.00,"currency":"usd","email":"buyer@example.com","description":"Pro plan"}'

# A support chat or message
curl -X POST "${sec}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"chat","id":"conv_77","name":"Sam","email":"sam@example.com","message":"Is there a family plan?","url":"https://your-chat-tool/conv/77"}'`,
    },
  };

  return (
    <div className="card space-y-4 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CopyField label="Public key (page views, messages; safe in web pages)" value={keys.public_key} />
        <CopyField label="Secret key (also sales and chats; servers only)" value={keys.secret_key} secret />
      </div>
      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-2">{code[tab].intro}</p>
      <Code code={code[tab].code} />
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink-muted">
        <span>Webhook: {HOOKS_URL}/ingest/&lt;key&gt;</span>
        <button className="btn-ghost text-xs" onClick={() => issue(true)} disabled={busy}>
          Make new keys
        </button>
      </div>
      {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}
