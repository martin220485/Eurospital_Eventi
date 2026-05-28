"use client";

import { useState } from "react";
import type { CustomField } from "@/lib/catalog-api";

type Answer = { field_id: number; value: string };

export function RegisterForm({
  eventId, fields, onSubmit,
}: { eventId: number; fields: CustomField[]; onSubmit: (answers: Answer[]) => void }) {
  const [values, setValues] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  function set(id: number, v: string) { setValues((s) => ({ ...s, [id]: v })); }

  function submit() {
    for (const f of fields) {
      const v = values[f.id] ?? "";
      if (f.field_type === "privacy_consent" && f.required && v !== "true") {
        setError("Devi accettare il consenso per procedere.");
        return;
      }
      if (f.required && f.field_type !== "privacy_consent" && !v.trim()) {
        setError(`Campo obbligatorio: ${f.label}`);
        return;
      }
    }
    setError("");
    onSubmit(fields.map((f) => ({ field_id: f.id, value: values[f.id] ?? "" })));
  }

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.id}>
          {f.field_type === "privacy_consent" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={f.label}
                     checked={values[f.id] === "true"}
                     onChange={(e) => set(f.id, e.target.checked ? "true" : "false")} />
              {f.label}{f.required && " *"}
            </label>
          ) : ["select", "radio"].includes(f.field_type) ? (
            <label className="block text-sm">{f.label}{f.required && " *"}
              <select className="mt-1 w-full rounded border p-2" value={values[f.id] ?? ""}
                      onChange={(e) => set(f.id, e.target.value)}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ) : f.field_type === "textarea" ? (
            <label className="block text-sm">{f.label}{f.required && " *"}
              <textarea className="mt-1 w-full rounded border p-2" value={values[f.id] ?? ""}
                        onChange={(e) => set(f.id, e.target.value)} />
            </label>
          ) : (
            <label className="block text-sm">{f.label}{f.required && " *"}
              <input
                className="mt-1 w-full rounded border p-2"
                type={["number", "email", "date", "time"].includes(f.field_type) ? f.field_type
                  : f.field_type === "datetime" ? "datetime-local" : f.field_type === "phone" ? "tel"
                  : f.field_type === "file" ? "file" : "text"}
                placeholder={f.placeholder ?? ""}
                value={f.field_type === "file" ? undefined : (values[f.id] ?? "")}
                onChange={(e) => set(f.id, e.target.value)} />
            </label>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={submit}>Iscriviti</button>
    </div>
  );
}
