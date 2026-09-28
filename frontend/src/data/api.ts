import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase";

const uid = () => {
  if (!auth.currentUser) throw new Error("Sign in first");
  return auth.currentUser.uid;
};

const call = <T = unknown,>(name: string) => async (data: object): Promise<T> => (await httpsCallable(functions, name)(data)).data as T;

export interface AppFields {
  name: string;
  url: string | null;
  platform: string;
  color: number;
  notes?: string;
}

export const AppsApi = {
  /** Adds an app and gives it webhook keys. */
  async create(fields: AppFields): Promise<string> {
    const ref = await addDoc(collection(db, `users/${uid()}/apps`), { ...fields, created_at: serverTimestamp() });
    await AppsApi.issueKeys(ref.id);
    return ref.id;
  },
  update: (appId: string, fields: AppFields) => updateDoc(doc(db, `users/${uid()}/apps/${appId}`), { ...fields }),
  remove: (appId: string) => call("removeApp")({ appId }),
  issueKeys: (appId: string) => call<{ public_key: string; secret_key: string }>("issueWebhookKeys")({ appId }),
};

export const IntegrationsApi = {
  connect: (appId: string, provider: string, config: Record<string, string>, secrets: Record<string, string>) =>
    call("connectService")({ appId, provider, config, secrets }),
  disconnect: (appId: string, provider: string) => call("disconnectService")({ appId, provider }),
  syncNow: (appId?: string) => call<Record<string, { ok: boolean; error?: string }>>("syncNow")({ appId }),
};

export const InboxApi = {
  setStatus: (itemId: string, status: "open" | "closed") => updateDoc(doc(db, `users/${uid()}/inbox/${itemId}`), { status }),
};

/** Firebase errors carry a code prefix ("functions/invalid-argument"); show just the message. */
export function errorMessage(error: unknown): string {
  const message = (error as Error)?.message ?? String(error);
  return message.replace(/^Firebase:\s*/, "").replace(/\s*\(auth\/[\w-]+\)\.?$/, "");
}
