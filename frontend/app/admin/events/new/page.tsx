"use client";

import { useRouter } from "next/navigation";
import { EventForm } from "@/components/admin/event-form";
import { api } from "@/lib/admin-api";
import type { EventInput } from "@/lib/event-schemas";

export default function NewEventPage() {
  const router = useRouter();
  async function create(data: EventInput) {
    const ev = await api.post<{ id: number }>("/events", data);
    router.push(`/admin/events/${ev.id}`);
  }
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Nuovo evento</h1>
      <EventForm onSubmit={create} />
    </div>
  );
}
