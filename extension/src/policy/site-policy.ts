import { browser } from "wxt/browser";

const storageKey = "nayanSitePolicy";
const localDemoOrigin = "http://localhost:5173";
type SitePolicy = Readonly<{ version: 1; allowedOrigins: readonly string[] }>;

function originOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : undefined;
  } catch { return undefined; }
}

async function currentPolicy(): Promise<SitePolicy> {
  const stored = (await browser.storage.local.get(storageKey))[storageKey] as Partial<SitePolicy> | undefined;
  const allowedOrigins = Array.isArray(stored?.allowedOrigins) ? stored.allowedOrigins.filter((origin): origin is string => typeof origin === "string" && originOf(origin) === origin) : [localDemoOrigin];
  return { version: 1, allowedOrigins: [...new Set([localDemoOrigin, ...allowedOrigins])] };
}

export async function allowSite(url: string): Promise<string> {
  const origin = originOf(url);
  if (!origin) throw new Error("Only regular HTTP(S) sites can be approved.");
  const policy = await currentPolicy();
  const next = { ...policy, allowedOrigins: [...new Set([...policy.allowedOrigins, origin])] };
  await browser.storage.local.set({ [storageKey]: next });
  return origin;
}

export async function isSiteAllowed(url: string): Promise<boolean> {
  const origin = originOf(url);
  return Boolean(origin && (await currentPolicy()).allowedOrigins.includes(origin));
}
