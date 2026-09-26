import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OfflineQueue } from "./offline/queue";

async function fetchHealth(): Promise<{ status: string }> {
  const response = await fetch("/api/v1/health");
  if (!response.ok) {
    throw new Error(`health check failed: ${response.status}`);
  }
  return (await response.json()) as { status: string };
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function useInstallPrompt(): { canInstall: boolean; install: () => void } {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return {
    canInstall: prompt !== null,
    install: () => {
      void prompt?.prompt();
      setPrompt(null);
    },
  };
}

function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function useQueuedCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (typeof localStorage === "undefined") {
      return;
    }
    const queue = new OfflineQueue(localStorage);
    setCount(queue.size);
    const sync = () => setCount(new OfflineQueue(localStorage).size);
    window.addEventListener("online", sync);
    const timer = window.setInterval(sync, 5000);
    return () => {
      window.removeEventListener("online", sync);
      window.clearInterval(timer);
    };
  }, []);
  return count;
}

const shell: React.CSSProperties = {
  fontFamily: "system-ui",
  margin: "0 auto",
  maxWidth: 720,
  padding: "16px 16px 96px",
  minHeight: "100dvh",
};

const tabBar: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  display: "flex",
  borderTop: "1px solid #e2e8f0",
  background: "#ffffff",
  paddingBottom: "env(safe-area-inset-bottom)",
};

const tab: React.CSSProperties = {
  flex: 1,
  padding: "12px 4px",
  textAlign: "center",
  fontSize: 13,
  color: "#0f172a",
  textDecoration: "none",
};

export function App() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });
  const online = useOnline();
  const queued = useQueuedCount();
  const { canInstall, install } = useInstallPrompt();

  return (
    <main style={shell}>
      <header>
        <h1 style={{ fontSize: 24, margin: "8px 0" }}>Admin alquiler</h1>
        <p style={{ margin: "0 0 12px", color: "#475569" }}>
          Plataforma de administración de arriendos — Colombia (es-CO, COP).
        </p>
        {!online ? (
          <p role="status" style={{ background: "#fef3c7", padding: 8, borderRadius: 8 }}>
            Sin conexión — los cambios se encolan y se sincronizan al volver la red.
            {queued > 0 ? ` (${queued} pendientes)` : ""}
          </p>
        ) : null}
        {canInstall ? (
          <button type="button" onClick={install} style={{ marginBottom: 12 }}>
            Instalar aplicación
          </button>
        ) : null}
      </header>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <a href="/portal/tenant" style={tab}>
          Portal arrendatario
        </a>
        <a href="/portal/owner" style={tab}>
          Portal propietario
        </a>
      </nav>
      <section aria-live="polite">
        <h2>API</h2>
        {health.isPending ? <p>Verificando API…</p> : null}
        {health.isError ? <p>API no disponible en desarrollo local.</p> : null}
        {health.data ? <p>API: {health.data.status}</p> : null}
      </section>
      <nav aria-label="Principal" style={tabBar}>
        <a href="/" style={tab}>
          Inicio
        </a>
        <a href="/portal/tenant" style={tab}>
          Arrendatario
        </a>
        <a href="/portal/owner" style={tab}>
          Propietario
        </a>
      </nav>
    </main>
  );
}
