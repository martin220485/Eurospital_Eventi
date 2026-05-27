import { NextResponse } from "next/server";
import { BACKEND_URL, COOKIE_OPTS } from "@/lib/backend";

export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return NextResponse.json({ detail: "Credenziali non valide" }, { status: res.status });
  }
  const { access_token, refresh_token } = await res.json();
  const out = NextResponse.json({ ok: true });
  out.cookies.set("access_token", access_token, COOKIE_OPTS);
  out.cookies.set("refresh_token", refresh_token, COOKIE_OPTS);
  return out;
}
