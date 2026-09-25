import { useQuery } from "@tanstack/react-query";

async function fetchHealth(): Promise<{ status: string }> {
  const response = await fetch("/api/v1/health");
  if (!response.ok) {
    throw new Error(`health check failed: ${response.status}`);
  }
  return (await response.json()) as { status: string };
}

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 640 }}>
      <h1>Admin alquiler</h1>
      <p>Plataforma de administración de arriendos — Colombia (es-CO, COP).</p>
      <section aria-live="polite">
        <h2>API</h2>
        {health.isPending ? <p>Verificando API…</p> : null}
        {health.isError ? <p>API no disponible en desarrollo local.</p> : null}
        {health.data ? <p>API: {health.data.status}</p> : null}
      </section>
    </main>
  );
}
