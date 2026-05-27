const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function call<T>(path: string, method: string, token?: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Setup-Token"] = token;
  const res = await fetch(`${BASE}/api/setup${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type SetupStatus = { setup_completed: boolean; current_step: number };
export type OpResult = { ok: boolean; error?: string | null };
export type MigrateResult = { revision: string; tables: string[]; views: string[] };

export const setupApi = {
  status: () => call<SetupStatus>("/status", "GET"),
  dbTest: (t: string) => call<OpResult>("/db/test", "POST", t),
  migrate: (t: string) => call<MigrateResult>("/db/migrate", "POST", t),
  createAdmin: (t: string, body: unknown) => call<{ id: number }>("/admin", "POST", t, body),
  saveSmtp: (t: string, body: unknown) => call<Record<string, unknown>>("/smtp", "PUT", t, body),
  testSmtp: (t: string, body: unknown) => call<OpResult>("/smtp/test", "POST", t, body),
  saveAd: (t: string, body: unknown) => call<OpResult>("/ad", "PUT", t, body),
  testAd: (t: string, body: unknown) => call<OpResult>("/ad/test", "POST", t, body),
  savePlatform: (t: string, body: unknown) => call<Record<string, unknown>>("/platform", "PUT", t, body),
  complete: (t: string) => call<{ setup_completed: boolean }>("/complete", "POST", t),
};
