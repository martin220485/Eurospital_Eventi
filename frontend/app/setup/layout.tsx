import { redirect } from "next/navigation";
import { setupApi } from "@/lib/setup-api";

export const dynamic = "force-dynamic";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  let completed = false;
  try {
    completed = (await setupApi.status()).setup_completed;
  } catch {
    // backend unreachable: render the wizard anyway
  }
  if (completed) redirect("/login");
  return <div className="mx-auto max-w-2xl p-6">{children}</div>;
}
