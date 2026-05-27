import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL, COOKIE_OPTS } from "@/lib/backend";

export async function POST() {
  const jar = await cookies();
  const refresh = jar.get("refresh_token")?.value;
  if (!refresh) return NextResponse.json({ detail: "No session" }, { status: 401 });
  const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) return NextResponse.json({ detail: "Refresh fallito" }, { status: 401 });
  const { access_token, refresh_token } = await res.json();
  const out = NextResponse.json({ ok: true });
  out.cookies.set("access_token", access_token, COOKIE_OPTS);
  out.cookies.set("refresh_token", refresh_token, COOKIE_OPTS);
  return out;
}
