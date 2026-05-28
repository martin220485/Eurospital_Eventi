"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Save, Trash2, Upload } from "lucide-react";
import { platformApi, type PlatformSettings } from "@/lib/admin-extra-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    platformApi.getSettings()
      .then(setSettings)
      .catch((e) => toast.error((e as Error).message));
  }, []);

  if (!settings) return <p>Caricamento…</p>;

  function set<K extends keyof PlatformSettings>(k: K, v: PlatformSettings[K]) {
    setSettings({ ...(settings as PlatformSettings), [k]: v });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    try {
      const saved = await platformApi.saveSettings(settings);
      setSettings(saved);
      toast.success("Impostazioni salvate");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function uploadLogo(f: File) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!["png", "jpg", "jpeg", "gif"].includes(ext)) {
      toast.error("Formato non supportato. Usa PNG/JPG/JPEG/GIF.");
      return;
    }
    setBusy(true);
    try {
      await platformApi.uploadLogo(f);
      toast.success("Logo caricato + favicon generato");
      setLogoVersion((v) => v + 1);
      // forza ricarico favicon nel browser
      if (typeof document !== "undefined") {
        const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
        if (link) link.href = `/favicon.ico?v=${Date.now()}`;
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function removeLogo() {
    if (!window.confirm("Rimuovere il logo caricato e tornare al brand di default?")) return;
    setBusy(true);
    try {
      await platformApi.deleteLogo();
      toast.success("Logo rimosso");
      setLogoVersion((v) => v + 1);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  const logoSrc = `/api/public/logo?v=${logoVersion}`;

  return (
    <div className="space-y-5">
      <div>
        <h1>Impostazioni piattaforma</h1>
        <p className="text-sm text-muted-foreground">Branding, lingua, timezone, URL pubblico</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-brand-600" /> Logo & favicon
          </CardTitle>
          <CardDescription>
            Carica un PNG/JPG/JPEG/GIF (max 5 MB). Il favicon ICO è generato in
            automatico (16/32/48 px) dal logo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt="logo"
                   className="max-h-full max-w-full"
                   onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            </div>
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.gif,image/png,image/jpeg,image/gif" hidden
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Carica immagine
                </Button>
                <Button type="button" variant="ghost" disabled={busy}
                        className="text-destructive hover:bg-destructive/10" onClick={removeLogo}>
                  <Trash2 className="h-4 w-4" /> Rimuovi
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Logo servito da <code>/api/public/logo</code>, favicon da <code>/favicon.ico</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generale</CardTitle>
          <CardDescription>Nome, colore primario, lingua, timezone, URL pubblico</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ps-name">Nome</Label>
                <Input id="ps-name" value={settings.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-logo">URL logo esterno (opzionale, override del logo caricato)</Label>
                <Input id="ps-logo" placeholder="https://…" value={settings.logo_url ?? ""}
                       onChange={(e) => set("logo_url", e.target.value || null)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ps-color">Colore primario</Label>
                <div className="flex gap-2">
                  <Input id="ps-color" type="color" className="h-9 w-16 p-1"
                         value={settings.primary_color}
                         onChange={(e) => set("primary_color", e.target.value)} />
                  <Input value={settings.primary_color}
                         onChange={(e) => set("primary_color", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-url">URL pubblico</Label>
                <Input id="ps-url" placeholder="https://eventi.eurospital.it" value={settings.public_url ?? ""}
                       onChange={(e) => set("public_url", e.target.value || null)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Lingua</Label>
                <Select value={settings.language} onValueChange={(v) => set("language", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-tz">Timezone</Label>
                <Input id="ps-tz" value={settings.timezone} onChange={(e) => set("timezone", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-ret">Retention dati (giorni)</Label>
              <Input id="ps-ret" type="number" value={settings.retention_days ?? ""}
                     onChange={(e) => set("retention_days", e.target.value ? Number(e.target.value) : null)}
                     className="w-40" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                <Save className="h-4 w-4" /> {busy ? "Salvataggio…" : "Salva"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
