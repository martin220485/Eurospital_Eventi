"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
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

  useEffect(() => { platformApi.getSettings().then(setSettings).catch((e) => toast.error((e as Error).message)); }, []);

  if (!settings) return <p>Caricamento…</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await platformApi.saveSettings(settings as unknown as PlatformSettings);
      setSettings(saved);
      toast.success("Impostazioni salvate");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  function set<K extends keyof PlatformSettings>(k: K, v: PlatformSettings[K]) {
    setSettings({ ...(settings as PlatformSettings), [k]: v });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1>Impostazioni piattaforma</h1>
        <p className="text-sm text-muted-foreground">Branding, lingua, timezone, URL pubblico</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generale</CardTitle>
          <CardDescription>Nome visualizzato, logo, colore primario</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ps-name">Nome</Label>
                <Input id="ps-name" value={settings.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-logo">URL logo</Label>
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
