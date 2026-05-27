"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";

type Attachment = { id: number; filename: string; kind: string; content_type: string };

export function AttachmentManager({ eventId }: { eventId: number }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const ev = await api.get<{ attachments?: Attachment[] }>(`/events/${eventId}`);
    setItems(ev.attachments ?? []);
  }
  useEffect(() => { load().catch(() => {}); }, [eventId]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>, kind: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch(`/api/events/${eventId}/attachments`, {
      method: "POST", body: fd, credentials: "include",
    });
    if (!res.ok) { setMsg("Upload non riuscito (tipo o dimensione non validi)."); return; }
    setMsg("Caricato.");
    await load();
  }

  async function remove(id: number) {
    await api.del(`/attachments/${id}`);
    await load();
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">Banner (immagine)
        <input className="block" type="file" accept="image/*" onChange={(e) => upload(e, "banner")} />
      </label>
      <label className="block text-sm">Allegato
        <input className="block" type="file" onChange={(e) => upload(e, "attachment")} />
      </label>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <ul className="divide-y rounded border bg-white">
        {items.map((a) => (
          <li key={a.id} className="flex items-center justify-between p-2 text-sm">
            <a className="text-blue-700" href={`/api/attachments/${a.id}/download`}>{a.filename} ({a.kind})</a>
            <button className="text-red-700" onClick={() => remove(a.id)}>Elimina</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
