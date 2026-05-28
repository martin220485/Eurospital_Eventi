"use client";

import { useState } from "react";
import { notificationsApi, type PreviewOut, type TemplateOut } from "@/lib/notifications-api";

export function TemplateEditor({ initial }: { initial: TemplateOut }) {
  const [subject, setSubject] = useState(initial.subject);
  const [bodyHtml, setBodyHtml] = useState(initial.body_html);
  const [preview, setPreview] = useState<PreviewOut | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onPreview() {
    setError(null);
    try {
      const p = await notificationsApi.preview(initial.code);
      setPreview(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore anteprima");
    }
  }

  async function onSave() {
    setSaving(true); setError(null); setSaved(false);
    try {
      await notificationsApi.updateTemplate(initial.code, {
        subject, body_html: bodyHtml,
      });
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{initial.name}</h1>
        <code className="text-xs text-gray-500">{initial.code}</code>
      </header>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Oggetto</span>
        <input
          aria-label="Oggetto"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Corpo HTML</span>
        <textarea
          aria-label="Corpo HTML"
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          rows={12}
          className="w-full rounded border px-3 py-2 font-mono text-sm"
        />
      </label>

      <p className="text-xs text-gray-600">
        Placeholder disponibili: <code>{"{{ user.full_name }}"}</code>,{" "}
        <code>{"{{ event.title }}"}</code>, <code>{"{{ event.start_at }}"}</code>,{" "}
        <code>{"{{ event.location }}"}</code>, <code>{"{{ registration.id }}"}</code>.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva"}
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="rounded border px-4 py-2"
        >
          Anteprima
        </button>
      </div>

      {error && <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {saved && <div role="status" className="rounded bg-green-50 p-3 text-sm text-green-700">Salvato.</div>}

      {preview && (
        <div className="space-y-2 rounded border p-4">
          <div className="font-medium">Anteprima oggetto:</div>
          <div className="text-sm">{preview.subject_rendered}</div>
          <div className="font-medium">Anteprima corpo:</div>
          <iframe
            title="anteprima"
            sandbox=""
            srcDoc={preview.body_rendered}
            className="h-64 w-full rounded border"
          />
        </div>
      )}
    </div>
  );
}
