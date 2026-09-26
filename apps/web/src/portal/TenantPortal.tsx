import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, type Session } from "../auth/session";
import { PhotoCapture } from "../components/PhotoCapture";
import { hasAllPermissions } from "./guard";
import type { Membership } from "../auth/session";

async function getJson<T>(session: Session, path: string): Promise<T> {
  const response = await fetch(path, { headers: authHeaders(session) });
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

interface MaintenanceItem {
  id: string;
  title: string;
  status: string;
}

function TrackRequests({ session }: { session: Session }) {
  const requests = useQuery({
    queryKey: ["tenant-requests"],
    queryFn: () => getJson<MaintenanceItem[]>(session, "/api/v1/maintenance-requests"),
  });
  if (requests.isPending) {
    return <p>Cargando solicitudes…</p>;
  }
  if (requests.isError) {
    return <p>No fue posible cargar tus solicitudes.</p>;
  }
  if (requests.data.length === 0) {
    return <p>No hay solicitudes registradas.</p>;
  }
  return (
    <ul>
      {requests.data.map((row) => (
        <li key={row.id}>
          {row.title} — {row.status}
        </li>
      ))}
    </ul>
  );
}

function MeterForm({ session }: { session: Session }) {
  const [unitId, setUnitId] = useState("");
  const [utility, setUtility] = useState("WATER");
  const [value, setValue] = useState("");
  const [readingDate, setReadingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const response = await fetch(`/api/v1/units/${unitId}/meter-readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(session) },
      body: JSON.stringify({ utility, value: Number(value), readingDate }),
    });
    if (response.status === 400) {
      setMessage("Lectura inválida o anómala — revisa el valor.");
      return;
    }
    if (!response.ok) {
      setMessage("No fue posible registrar la lectura.");
      return;
    }
    const created = (await response.json()) as {
      anomaly: { anomaly: boolean; reason: string | null };
    };
    setMessage(
      created.anomaly.anomaly
        ? `Registrada con alerta: ${created.anomaly.reason ?? "verificar"}.`
        : "Lectura registrada.",
    );
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
      <label>
        Unidad (ID)
        <input value={unitId} onChange={(event) => setUnitId(event.target.value)} required />
      </label>
      <label>
        Servicio
        <input value={utility} onChange={(event) => setUtility(event.target.value)} required />
      </label>
      <label>
        Lectura
        <input
          type="number"
          step="any"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
        />
      </label>
      <label>
        Fecha
        <input
          type="date"
          value={readingDate}
          onChange={(event) => setReadingDate(event.target.value)}
          required
        />
      </label>
      {message ? <p role="status">{message}</p> : null}
      <button type="submit">Registrar lectura</button>
    </form>
  );
}

export function TenantPortal({
  session,
  memberships,
  propertyId,
}: {
  session: Session;
  memberships: Membership[];
  propertyId: string;
}) {
  return (
    <main style={{ margin: "0 auto", maxWidth: 720, padding: "16px 16px 96px" }}>
      <h1>Portal del arrendatario</h1>
      {hasAllPermissions(memberships, ["maintenance:read"]) ? (
        <section>
          <h2>Mis solicitudes</h2>
          <TrackRequests session={session} />
        </section>
      ) : null}
      {hasAllPermissions(memberships, ["contract:write"]) ? (
        <section>
          <h2>Registrar lectura del medidor</h2>
          <MeterForm session={session} />
        </section>
      ) : null}
      {hasAllPermissions(memberships, ["property:write"]) ? (
        <section>
          <h2>Subir evidencia</h2>
          <PhotoCapture session={session} propertyId={propertyId} kind="PHOTO" />
        </section>
      ) : null}
    </main>
  );
}
