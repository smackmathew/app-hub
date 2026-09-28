// Tests firestore.rules directly: what a signed-in user could do by talking to Firestore themselves.
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-app-hub",
    firestore: { rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alex/apps/a1"), { name: "Recipes", url: null, platform: "Claude", color: 0, created_at: new Date() });
    await setDoc(doc(db, "users/alex/apps/a1/daily/2026-09-10"), { date: "2026-09-10", sources: { stripe: { revenue_cents: 100, orders: 1 } } });
    await setDoc(doc(db, "users/alex/apps/a1/integrations/stripe"), { provider: "stripe", status: "connected" });
    await setDoc(doc(db, "users/alex/inbox/i1"), { app_id: "a1", status: "open", preview: "Hi", kind: "chat" });
    await setDoc(doc(db, "users/alex/sales/s1"), { app_id: "a1", amount_cents: 100 });
    await setDoc(doc(db, "integration_secrets/alex__a1__stripe"), { uid: "alex", secrets: { api_key: "rk" } });
    await setDoc(doc(db, "ingest_keys/pub_x"), { uid: "alex", app_id: "a1", scope: "public" });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const newApp = { name: "Timer", url: "https://timer.app", platform: "Base44", color: 3, created_at: serverTimestamp() };

describe("the owner", () => {
  it("reads everything under their user", async () => {
    const db = as("alex");
    await assertSucceeds(getDocs(collection(db, "users/alex/apps")));
    await assertSucceeds(getDocs(collection(db, "users/alex/apps/a1/daily")));
    await assertSucceeds(getDocs(collection(db, "users/alex/apps/a1/integrations")));
    await assertSucceeds(getDocs(collection(db, "users/alex/inbox")));
    await assertSucceeds(getDocs(collection(db, "users/alex/sales")));
  });

  it("adds and edits apps, within limits", async () => {
    const db = as("alex");
    await assertSucceeds(setDoc(doc(db, "users/alex/apps/a2"), newApp));
    await assertSucceeds(updateDoc(doc(db, "users/alex/apps/a1"), { name: "Recipe Box", notes: "Launched in May" }));
    await assertFails(setDoc(doc(db, "users/alex/apps/a3"), { ...newApp, name: "" }));
    await assertFails(setDoc(doc(db, "users/alex/apps/a3"), { ...newApp, color: 9 }));
    await assertFails(setDoc(doc(db, "users/alex/apps/a3"), { ...newApp, revenue: 1_000_000 }));
    await assertFails(updateDoc(doc(db, "users/alex/apps/a1"), { created_at: new Date(0) }));
  });

  it("can only mark inbox items done or open", async () => {
    const db = as("alex");
    await assertSucceeds(updateDoc(doc(db, "users/alex/inbox/i1"), { status: "closed" }));
    await assertFails(updateDoc(doc(db, "users/alex/inbox/i1"), { status: "deleted" }));
    await assertFails(updateDoc(doc(db, "users/alex/inbox/i1"), { preview: "edited" }));
    await assertFails(setDoc(doc(db, "users/alex/inbox/i2"), { app_id: "a1", status: "open" }));
  });

  it("can't write numbers, sales or integration status (the server does), or delete apps directly", async () => {
    const db = as("alex");
    await assertFails(setDoc(doc(db, "users/alex/apps/a1/daily/2026-09-11"), { date: "2026-09-11" }));
    await assertFails(setDoc(doc(db, "users/alex/sales/s2"), { app_id: "a1", amount_cents: 5 }));
    await assertFails(updateDoc(doc(db, "users/alex/apps/a1/integrations/stripe"), { status: "error" }));
    await assertFails(deleteDoc(doc(db, "users/alex/apps/a1")));
  });

  it("can never read service credentials or webhook keys", async () => {
    const db = as("alex");
    await assertFails(getDoc(doc(db, "integration_secrets/alex__a1__stripe")));
    await assertFails(getDoc(doc(db, "ingest_keys/pub_x")));
    await assertFails(getDocs(collection(db, "integration_secrets")));
  });
});

describe("anyone else", () => {
  it("sees nothing and changes nothing", async () => {
    for (const db of [as("mallory"), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, "users/alex/apps/a1")));
      await assertFails(getDocs(collection(db, "users/alex/apps/a1/daily")));
      await assertFails(getDocs(collection(db, "users/alex/inbox")));
      await assertFails(getDocs(collection(db, "users/alex/sales")));
      await assertFails(setDoc(doc(db, "users/alex/apps/a9"), newApp));
      await assertFails(updateDoc(doc(db, "users/alex/inbox/i1"), { status: "closed" }));
    }
  });
});
