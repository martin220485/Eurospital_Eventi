import { CheckinScanner } from "@/components/admin/checkin-scanner";

export default function CheckinPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1>Check-in</h1>
        <p className="text-sm text-muted-foreground">
          Scansiona o incolla il token QR del partecipante.
        </p>
      </div>
      <CheckinScanner />
    </div>
  );
}
