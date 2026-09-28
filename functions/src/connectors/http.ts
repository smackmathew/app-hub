/** Makes a request and returns the parsed JSON, or throws an error naming the service and status. */
export async function requestJson<T = any>(fetchFn: typeof fetch, service: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchFn(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${service} returned ${response.status}: ${text.slice(0, 200) || response.statusText}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${service} returned a response that isn't JSON`);
  }
}

/** Strips HTML tags and collapses whitespace, for message previews. */
export function plainText(html: string | null | undefined, max = 500): string {
  if (!html) return "";
  const text = html
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function zeroDays<T extends object>(days: string[], zero: () => T): Record<string, T> {
  return Object.fromEntries(days.map((d) => [d, zero()]));
}
