"use client";

import { useState } from "react";
import { ldapApi, type LdapSettingsOut } from "@/lib/ldap-api";

export function LdapConfigForm({ initial }: { initial: LdapSettingsOut }) {
  const [form, setForm] = useState(() => ({
    ...initial,
    bind_password: "",
    attr_mapping_json: JSON.stringify(initial.attr_mapping ?? {}, null, 2),
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      let attr_mapping: Record<string, string> = {};
      try {
        attr_mapping = JSON.parse(form.attr_mapping_json || "{}");
      } catch {
        throw new Error("attr_mapping non è JSON valido");
      }
      await ldapApi.saveSettings({
        sso_enabled: form.sso_enabled,
        server_uri: form.server_uri,
        base_dn: form.base_dn,
        bind_dn: form.bind_dn,
        bind_password: form.bind_password || null,
        user_filter: form.user_filter,
        group_filter: form.group_filter,
        attr_mapping,
        users_group: form.users_group,
        admins_group: form.admins_group,
      });
      setMsg({ kind: "ok", text: "Salvato." });
    } catch (e: unknown) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "errore" });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true); setMsg(null);
    try {
      const res = await ldapApi.testConnection();
      setMsg({ kind: res.ok ? "ok" : "err", text: res.message || (res.ok ? "Connessione OK" : "Errore") });
    } catch (e: unknown) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "errore" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.sso_enabled}
          onChange={(e) => set("sso_enabled", e.target.checked)}
        />
        <span>SSO attivo (login utenti via AD/LDAP)</span>
      </label>

      <Field label="Server URI" value={form.server_uri ?? ""}
             onChange={(v) => set("server_uri", v)} placeholder="ldap://corp.local oppure ldaps://..." />
      <Field label="Base DN" value={form.base_dn ?? ""}
             onChange={(v) => set("base_dn", v)} placeholder="DC=corp,DC=local" />
      <Field label="Bind DN" value={form.bind_dn ?? ""}
             onChange={(v) => set("bind_dn", v)} placeholder="CN=Service,DC=corp,DC=local" />
      <Field
        label={`Bind password ${initial.has_bind_password ? "(impostata)" : ""}`}
        value={form.bind_password}
        onChange={(v) => set("bind_password", v)}
        type="password"
        placeholder={initial.has_bind_password ? "(invariata)" : ""}
      />
      <Field label="User filter" value={form.user_filter ?? ""}
             onChange={(v) => set("user_filter", v)} placeholder="(sAMAccountName={username})" />
      <Field label="Group filter" value={form.group_filter ?? ""}
             onChange={(v) => set("group_filter", v)} />
      <Field label="Gruppo utenti" value={form.users_group ?? ""}
             onChange={(v) => set("users_group", v)} placeholder="CN dei dipendenti" />
      <Field label="Gruppo amministratori" value={form.admins_group ?? ""}
             onChange={(v) => set("admins_group", v)} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Mappatura attributi (JSON)</span>
        <textarea
          aria-label="attr-mapping"
          value={form.attr_mapping_json}
          onChange={(e) => set("attr_mapping_json", e.target.value)}
          rows={6}
          className="w-full rounded border px-2 py-1 font-mono text-xs"
        />
      </label>

      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {busy ? "…" : "Salva"}
        </button>
        <button onClick={test} disabled={busy} className="rounded border px-4 py-2">Test connessione</button>
      </div>

      {msg && (
        <div role="alert" className={
          msg.kind === "ok"
            ? "rounded bg-green-50 p-3 text-sm text-green-700"
            : "rounded bg-red-50 p-3 text-sm text-red-700"
        }>{msg.text}</div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        aria-label={label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border px-2 py-1 text-sm"
      />
    </label>
  );
}
