"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { FIELD_TYPES, OPTION_TYPES } from "@/lib/event-schemas";

type Option = { label: string; value: string; position: number };
type Field = {
  label: string; field_type: string; required: boolean;
  placeholder?: string; position: number; options: Option[];
};

export function FieldBuilder({ eventId }: { eventId: number }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<Field[]>(`/events/${eventId}/fields`).then((f) =>
      setFields(f.map((x) => ({ ...x, options: x.options ?? [] })))
    ).catch(() => {});
  }, [eventId]);

  function add() {
    setFields((f) => [...f, { label: "", field_type: "text", required: false, position: f.length, options: [] }]);
  }
  function update(i: number, patch: Partial<Field>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function remove(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, position: idx })));
  }
  function move(i: number, dir: -1 | 1) {
    setFields((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const copy = [...f];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy.map((x, idx) => ({ ...x, position: idx }));
    });
  }
  function addOption(i: number) {
    setFields((f) => f.map((x, idx) => idx === i
      ? { ...x, options: [...x.options, { label: "", value: "", position: x.options.length }] } : x));
  }

  async function save() {
    try {
      await api.put(`/events/${eventId}/fields`, { fields });
      setMsg("Campi salvati.");
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      {fields.map((f, i) => (
        <div key={i} className="rounded border bg-white p-3 space-y-2">
          <div className="flex gap-2">
            <input className="flex-1 rounded border p-2" placeholder="Etichetta campo"
                   value={f.label} onChange={(e) => update(i, { label: e.target.value })} />
            <select className="rounded border p-2" value={f.field_type}
                    onChange={(e) => update(i, { field_type: e.target.value })}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="text-gray-500" onClick={() => move(i, -1)}>↑</button>
            <button className="text-gray-500" onClick={() => move(i, 1)}>↓</button>
            <button className="text-red-700" onClick={() => remove(i)}>✕</button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} /> Obbligatorio
          </label>
          {OPTION_TYPES.includes(f.field_type) && (
            <div className="pl-4">
              {f.options.map((o, oi) => (
                <div key={oi} className="mb-1 flex gap-2">
                  <input className="rounded border p-1 text-sm" placeholder="Etichetta opzione"
                         value={o.label}
                         onChange={(e) => update(i, { options: f.options.map((x, idx) => idx === oi ? { ...x, label: e.target.value } : x) })} />
                  <input className="rounded border p-1 text-sm" placeholder="Valore"
                         value={o.value}
                         onChange={(e) => update(i, { options: f.options.map((x, idx) => idx === oi ? { ...x, value: e.target.value } : x) })} />
                </div>
              ))}
              <button className="text-sm text-blue-700" onClick={() => addOption(i)}>+ opzione</button>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button className="rounded border px-4 py-2" onClick={add}>Aggiungi campo</button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva campi</button>
      </div>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
    </div>
  );
}
