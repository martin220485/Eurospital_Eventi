import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/admin/notifications/template-editor";
import type { TemplateOut } from "@/lib/notifications-api";

async function fetchTemplate(code: string): Promise<TemplateOut | null> {
  const h = await headers();
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
  const cookie = h.get("cookie") ?? "";
  const r = await fetch(`${base}/api/admin/notification-templates/${code}`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const tmpl = await fetchTemplate(code);
  if (!tmpl) notFound();
  return <TemplateEditor initial={tmpl} />;
}
