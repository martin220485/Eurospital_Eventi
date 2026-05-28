import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, FileText, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TemplateRow = { code: string; name: string; updated_at: string };

async function fetchTemplates(): Promise<TemplateRow[]> {
  const h = await headers();
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
  const cookie = h.get("cookie") ?? "";
  const r = await fetch(`${base}/api/admin/notification-templates`, {
    headers: { cookie }, cache: "no-store",
  });
  if (!r.ok) return [];
  return r.json();
}

export default async function NotificationsPage() {
  const templates = await fetchTemplates();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1>Notifiche</h1>
          <p className="text-sm text-muted-foreground">Template email + log invii</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/notifications/broadcast">
              <Send className="h-4 w-4" /> Broadcast
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/notifications/logs">
              <FileText className="h-4 w-4" /> Log invii <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-brand-600" />
            Template email
          </CardTitle>
          <CardDescription>Soggetto + corpo HTML Jinja, sanitizzati al salvataggio</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {templates.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">Nessun template.</p>
          ) : (
            <ul className="divide-y">
              {templates.map((t) => (
                <li key={t.code} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <code className="text-xs text-muted-foreground">{t.code}</code>
                  </div>
                  <Button variant="ghost" asChild>
                    <Link href={`/admin/notifications/templates/${t.code}`}>
                      Modifica <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
