import { CalendarView } from "@/components/app/calendar/calendar-view";

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1>Calendario</h1>
        <p className="text-sm text-muted-foreground">Visualizza gli eventi per mese, settimana, giorno o lista</p>
      </div>
      <CalendarView />
    </div>
  );
}
