import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend";

export async function POST() {
  const jar = await cookies();
  const refresh = jar.get("refresh_token")?.value;
  if (refresh) {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => {});
  }
  const out = NextResponse.json({ ok: true });
  out.cookies.delete("access_token");
  out.cookies.delete("refresh_token");
  return out;
}
