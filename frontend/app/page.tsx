const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";

async function getBackendStatus(): Promise<string> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) return "backend ko";
    const data = (await res.json()) as { status?: string };
    return data.status === "ok" ? "backend ok" : "backend ko";
  } catch {
    return "backend ko";
  }
}

export default async function Home() {
  const status = await getBackendStatus();
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Eurospital Eventi</h1>
      <p>{status}</p>
    </main>
  );
}
