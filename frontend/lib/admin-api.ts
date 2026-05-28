// Client-side calls to the backend; cookies travel automatically (same origin
// behind nginx). On 401, try one refresh then retry; otherwise redirect to login.
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 401 && retry) {
    const r = await fetch("/api/session/refresh", { method: "POST" });
    if (r.ok) return request<T>(path, init, false);
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Sessione scaduta");
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

export async function login(identifier: string, password: string) {
  const res = await fetch("/api/session/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error("Credenziali non valide");
}

export async function logout() {
  await fetch("/api/session/logout", { method: "POST" });
}

export async function resolveLanding(): Promise<string> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return "/login";
    const me = await res.json();
    return Array.isArray(me.permissions) && me.permissions.length > 0 ? "/admin/events" : "/app";
  } catch {
    return "/login";
  }
}
