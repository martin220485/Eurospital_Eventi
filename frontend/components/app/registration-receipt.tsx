export function RegistrationReceipt({ registrationId, status }: { registrationId: number; status: string }) {
  return (
    <div className="rounded border bg-white p-4 text-center">
      <p className="mb-2 text-sm">Stato iscrizione: <span className="font-medium">{status}</span></p>
      {status === "confirmed" && (
        <>
          <p className="mb-2 text-xs text-gray-500">Mostra questo QR all&apos;ingresso</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mx-auto" alt="QR check-in" width={180} height={180}
               src={`/api/registrations/${registrationId}/qr`} />
        </>
      )}
    </div>
  );
}
