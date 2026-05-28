"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, logout } from "@/lib/admin-api";

export function UserTopbar() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    api.get<{ full_name?: string; username: string }>("/auth/me")
      .then((u) => setName(u.full_name || u.username)).catch(() => {});
  }, []);

  async function doLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-3">
      <div />
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-600">{name}</span>
        <button className="rounded border px-3 py-1 hover:bg-gray-50" onClick={doLogout}>Logout</button>
      </div>
    </header>
  );
}
