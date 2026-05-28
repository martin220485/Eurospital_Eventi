import { CheckinScanner } from "@/components/admin/checkin-scanner";

export default function CheckinPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Check-in</h1>
      <p className="text-sm text-gray-600">Scansiona o incolla il token QR del partecipante.</p>
      <CheckinScanner />
    </div>
  );
}
