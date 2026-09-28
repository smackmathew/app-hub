// Fills the local emulators with a demo account and a few apps, so you can try the dashboard
// without connecting anything. Run with the emulators going:  npm run seed
// Then sign in at http://localhost:5173 as demo@example.com / password123.
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

const { initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore } = await import("firebase-admin/firestore");
const { issueKeys } = await import("../lib/integrations.js");
const { upsertInbox, writeDaily, writeSales } = await import("../lib/store.js");
const { addDays, dayIn } = await import("../lib/dates.js");

const PROJECT = "demo-app-hub";
const TZ = process.env.TIME_ZONE ?? "America/New_York";
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

let user;
try {
  user = await auth.getUserByEmail("demo@example.com");
} catch {
  user = await auth.createUser({ email: "demo@example.com", password: "password123" });
}
const uid = user.uid;
await db.recursiveDelete(db.doc(`users/${uid}`));

// A seeded random, so every run looks the same.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const apps = [
  { name: "Recipe Box", platform: "Claude", url: "https://recipebox.app", color: 0, visitors: 420, price: 900, conv: 0.012, traffic: "plausible", sales: "stripe" },
  { name: "Invoice Snap", platform: "Base44", url: "https://invoicesnap.io", color: 1, visitors: 180, price: 2900, conv: 0.02, traffic: "ga4", sales: "stripe" },
  { name: "Habit Garden", platform: "Lovable", url: "https://habitgarden.co", color: 2, visitors: 260, price: 499, conv: 0.015, traffic: "webhook", sales: "webhook" },
  { name: "Tide Tables", platform: "Vercel", url: "https://tides.fyi", color: 3, visitors: 640, price: 0, conv: 0, traffic: "plausible", sales: null },
  { name: "Pet Sitter CRM", platform: "Replit", url: "https://petsitter.app", color: 4, visitors: 70, price: 4900, conv: 0.03, traffic: "ga4", sales: "stripe" },
];

const today = dayIn(TZ);
const now = Date.now();
const people = ["Sam Lee", "Priya Patel", "Jordan Kim", "Alex Rivera", "Morgan Chen", "Taylor Brooks", "Casey Nguyen", "Riley Adams"];
const questions = [
  ["Can I export my data?", "Hi! Is there a way to export everything as CSV? I want to back it up."],
  ["Refund request", "I was charged twice this month, can you refund one of them?"],
  ["Feature idea", "Would love a dark mode. Otherwise the app is great!"],
  [null, "Is there a discount for students?"],
  [null, "The sync button spins forever on my phone."],
  ["Partnership", "We run a newsletter with 20k readers and would like to feature you."],
];

for (const [index, spec] of apps.entries()) {
  const ref = await db.collection(`users/${uid}/apps`).add({
    name: spec.name,
    url: spec.url,
    platform: spec.platform,
    color: spec.color,
    notes: "",
    created_at: new Date(now - (index + 1) * 86_400_000 * 40),
  });
  const appId = ref.id;
  await issueKeys(db, uid, { appId });

  const traffic = {};
  const sales = {};
  const saleList = [];
  for (let i = 179; i >= 0; i--) {
    const day = addDays(today, -i);
    const growth = 0.6 + 0.4 * ((180 - i) / 180);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const visitors = Math.round(spec.visitors * growth * (weekday === 0 || weekday === 6 ? 0.7 : 1) * (0.75 + rand() * 0.5));
    traffic[day] = { visitors, pageviews: Math.round(visitors * (2 + rand() * 2)) };
    if (spec.sales) {
      const orders = Math.max(0, Math.round(visitors * spec.conv * (0.5 + rand())));
      sales[day] = { revenue_cents: orders * spec.price, orders };
      if (i < 20) {
        for (let o = 0; o < orders; o++) {
          saleList.push({
            id: `${appId}_${day}_${o}`,
            amount_cents: spec.price,
            currency: "usd",
            customer_email: `${people[Math.floor(rand() * people.length)].split(" ")[0].toLowerCase()}@example.com`,
            description: `${spec.name} ${spec.price >= 2900 ? "Pro" : "Plus"} plan`,
            created_at: now - i * 86_400_000 - Math.floor(rand() * 8) * 3_600_000,
          });
        }
      }
    }
  }
  await writeDaily(db, uid, appId, spec.traffic, traffic);
  if (spec.sales) {
    await writeDaily(db, uid, appId, spec.sales, sales);
    await writeSales(db, uid, appId, spec.sales, saleList.filter((s) => s.created_at <= now));
  }
  const provider = { stripe: "stripe", plausible: "plausible", ga4: "ga4" };
  for (const p of [spec.traffic, spec.sales]) {
    if (provider[p]) {
      await db.doc(`users/${uid}/apps/${appId}/integrations/${p}`).set({
        provider: p,
        config: {},
        status: "connected",
        last_error: null,
        last_sync_at: new Date(now - 12 * 60_000),
        connected_at: new Date(now - 30 * 86_400_000),
      });
    }
  }

  // Support conversations over the last three weeks.
  const support = index % 2 === 0 ? "crisp" : "intercom";
  await db.doc(`users/${uid}/apps/${appId}/integrations/${support}`).set({
    provider: support,
    config: {},
    status: index === 4 ? "error" : "connected",
    last_error: index === 4 ? "Intercom returned 401: Access token is invalid" : null,
    last_sync_at: new Date(now - 12 * 60_000),
  });
  const count = 3 + Math.floor(rand() * 5);
  for (let c = 0; c < count; c++) {
    const [subject, text] = questions[Math.floor(rand() * questions.length)];
    const person = people[Math.floor(rand() * people.length)];
    const at = now - Math.floor(rand() * 21 * 86_400_000);
    await upsertInbox(
      db,
      uid,
      appId,
      support,
      {
        id: `${appId}_${c}`,
        kind: c % 3 === 0 ? "message" : "chat",
        from_name: person,
        from_email: `${person.split(" ")[0].toLowerCase()}@example.com`,
        subject,
        preview: text,
        url: support === "crisp" ? "https://app.crisp.chat/" : "https://app.intercom.com/",
        closed: at < now - 4 * 86_400_000,
        received_at: at,
        updated_at: at,
      },
      TZ,
    );
  }
}

// Exercise the real webhook function: a contact form, a page view and a sale.
const first = (await db.collection(`users/${uid}/apps`).where("name", "==", "Habit Garden").get()).docs[0];
const keys = (await db.doc(`users/${uid}/apps/${first.id}/integrations/webhook`).get()).data();
const hook = `http://127.0.0.1:5001/${PROJECT}/us-central1/hooks/ingest`;
const post = (key, body, type = "application/json") =>
  fetch(`${hook}/${key}`, { method: "POST", headers: { "Content-Type": type }, body, redirect: "manual" }).then((r) => r.status);
console.log(
  "webhook:",
  await post(keys.public_key, new URLSearchParams({ name: "Dana Fox", email: "dana@example.com", subject: "Love it", message: "Habit Garden got me to 60 days of running!" }).toString(), "application/x-www-form-urlencoded"),
  await post(keys.public_key, JSON.stringify({ type: "pageview", new_visitor: true }), "text/plain"),
  await post(keys.secret_key, JSON.stringify({ type: "sale", id: "gumroad_1", amount: 4.99, email: "dana@example.com", description: "Habit Garden Plus" })),
);
console.log(`Seeded ${apps.length} apps. Sign in as demo@example.com / password123`);
process.exit(0);
