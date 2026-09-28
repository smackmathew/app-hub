# App Hub

One dashboard for every web app you've built, wherever it lives (Claude, Base44, Lovable,
Vercel, Replit...). It shows each app's **traffic**, **sales**, **messages** and **support chats**
side by side, with an inbox you can work through.

- **Overview**: revenue, orders, visitors and new conversations for the last 7/30/90 days, with
  change vs the previous period. Revenue and visitors per day, stacked by app. A table with each
  app's numbers and the health of its connected services. The latest messages and sales.
- **App page**: that app's numbers and charts. Connect its services and get its webhook
  snippets.
- **Inbox**: every contact form, email and support conversation from all apps in one list. Filter
  by app/type, mark done, or jump to the conversation in Crisp/Intercom. A customer reply reopens it.
- **Sales**: every sale across apps.

Everything updates live. Connected services sync every hour, or on demand with **Sync now**.

## Where the numbers come from

| | Connect a service (pulled hourly) | Or send to the app's webhook |
|---|---|---|
| **Traffic** | Plausible, Google Analytics 4 | A 1-line tracking snippet (no cookies) |
| **Sales** | Stripe (charges, payments, refunds) | `sale` events from any other payment tool or your server |
| **Support chats** | Crisp, Intercom, Tawk.to (Tawk pushes events as they happen) | `chat` events from any other tool |
| **Messages** | Intercom email conversations | A plain HTML contact form, forwarded email (Cloudflare Email Worker, Zapier, Make) |

Each app's page has copy-paste code for every webhook option, already filled in with that
app's address and keys.

### The webhook

`POST https://<your-site>/hooks/ingest/<key>`, as JSON or a normal HTML form post.

| `type` | Fields | Key |
|---|---|---|
| `message` (default), `email` | `name`, `email`/`from`, `subject`, `message`, optional `id`, `url`, `source` | public or secret |
| `pageview` | `path`, `new_visitor` (true on a visitor's first view of the day) | public or secret |
| `chat` | same as message | secret |
| `sale` | `amount` (e.g. `19.99`) or `amount_cents`, `currency`, `email`, `description`, `id` | secret |

Each app has two keys. The **public** key can only add page views and messages, so it's
safe to put in a web page. The **secret** key can also report sales and chats; keep it on
servers. Sending the same `id` twice doesn't count it twice. Forms can include
`_redirect=<url>` to send people back to your site, and a hidden `_gotcha` field that bots
fill in and people don't (those posts are dropped). **Make new keys** on the app page retires
the old ones.

## How it's built

A Firebase app (the same setup as the household dashboard):

- **Frontend** (`frontend/`): React + TypeScript (Vite), Tailwind, Recharts. Served by
  Firebase Hosting. Light and dark mode follow your system.
- **Data**: Cloud Firestore, all under `users/{uid}/...`, readable only by that signed-in user
  (`firestore.rules`). Daily numbers are stored per app, per day, per source, so Stripe, Plausible
  and the webhook never overwrite each other. If an app has both Plausible/GA and the snippet,
  the analytics service's traffic counts and the snippet's is ignored.
- **Cloud Functions** (`functions/`): the connectors, the hourly sync, and the `/hooks` webhook.
  **Service credentials are stored server-side only** (a Firestore collection with no rules,
  which no browser can read). The web app sends them once, when connecting, and can't read
  them back.

## Putting it online

You need a Firebase project on the **Blaze** plan (Cloud Functions and scheduled jobs require it;
a personal dashboard stays well inside the free allowance), and Node.js 22.

1. **Set up the project** in the [Firebase console](https://console.firebase.google.com):
   - **Authentication** → Get started → **Email/Password** → enable.
   - **Firestore Database** → Create database (production mode; the rules come from this repo).
   - **Project settings** → General → Your apps → add a **Web app**, and copy its config values.
2. **Configure the web app**: copy `frontend/.env.example` to `frontend/.env.local` and fill it in.
3. **Configure the functions**: copy `functions/.env.example` to `functions/.env` and set your
   `TIME_ZONE`. Days are counted in this time zone.
4. **Deploy**, from the repository root:
   ```bash
   (cd frontend && npm ci && npm run build)
   (cd functions && npm ci)
   npx --prefix frontend firebase login
   npx --prefix frontend firebase use --add     # pick your project
   npx --prefix frontend firebase deploy
   ```
   It prints your dashboard's address (`https://<project-id>.web.app`). Webhooks live under
   `https://<project-id>.web.app/hooks/...`.
5. **Create your account**: open the dashboard and choose "Create your account".
6. **Turn off sign-ups** so nobody else can make one: Authentication → Settings → User actions →
   uncheck "Enable create (sign-up)". (Each account only ever sees its own data anyway.)
7. **Add your apps** and connect their services on each app's page. The first Stripe/analytics
   sync imports the last 90 days.

### What each service needs

| Service | What to paste | Where to get it |
|---|---|---|
| Stripe | Restricted key | Developers → API keys → Create restricted key, **Read** on Balance and Charges only |
| Plausible | Site ID + Stats API key | Account settings → API keys (self-hosted: also your address) |
| Google Analytics 4 | Property ID + service account JSON key | Google Cloud: service account + JSON key, enable "Google Analytics Data API". GA Admin → Property access management: add the service account's email as Viewer |
| Crisp | Website ID + plugin token (identifier, key) | marketplace.crisp.chat → new plugin with `website:conversation:sessions` read |
| Intercom | Access token | Developer Hub → your app → Authentication |
| Tawk.to | Webhook secret | Administration → Webhooks → new webhook to the URL shown on the app page, events *Chat Start* and *New Ticket* |

Revenue totals assume your apps are paid in one currency (amounts are shown in USD). Stripe's
numbers are in your account's settlement currency, so a Stripe account that settles in another
currency shows the right amounts with the wrong symbol.

## Developing locally

Everything runs against the Firebase emulators, so you don't touch real data (Java 11+ needed).

```bash
(cd functions && npm ci)
cd frontend && npm ci
npm run emulators                         # terminal 1: Auth, Firestore, Functions (UI at http://localhost:4000)
npm run dev:emulators                     # terminal 2: the dashboard at http://localhost:5173
npm --prefix ../functions run seed        # terminal 3: demo data; sign in as demo@example.com / password123
```

## Tests

```bash
cd functions && npm test   # connectors (with stand-ins for each service), sync, inbox, webhook
cd frontend && npm test    # security rules and the dashboard's math
```

Both start the Firestore emulator themselves. GitHub Actions runs both on every push.

## Limits worth knowing

- Numbers refresh hourly (or with Sync now); Tawk.to and webhook events show up instantly.
- The public webhook key is visible in your pages, so someone could send fake page views or
  messages with it. It can't add sales or chats. If it's abused, make new keys.
- One Stripe account per app. If several apps share a Stripe account, connect it to one app,
  or report each app's sales through its webhook instead.
- The traffic snippet counts full page loads. A single-page app should call it again on each
  route change.
