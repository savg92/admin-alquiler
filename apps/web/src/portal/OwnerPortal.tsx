import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, type Session } from "../auth/session";

async function getJson<T>(session: Session, path: string): Promise<T> {
  const response = await fetch(path, { headers: authHeaders(session) });
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

interface Kpis {
  occupancy: number;
  delinquencyRate: number;
  overdueMinor: number;
  totalBilledMinor: number;
  perPropertyPnl: {
    propertyId: string;
    collectedMinor: number;
    commissionMinor: number;
    deductionsMinor: number;
    netMinor: number;
    currency: string;
  }[];
}

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toLocaleString("es-CO")} ${currency}`;
}

export function OwnerPortal({ session }: { session: Session }) {
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const kpis = useQuery({
    queryKey: ["owner-kpis", period],
    queryFn: () => getJson<Kpis>(session, `/api/v1/kpis?period=${period}`),
  });

  return (
    <main style={{ margin: "0 auto", maxWidth: 720, padding: "16px 16px 96px" }}>
      <h1>Portal del propietario</h1>
      <p style={{ color: "#475569" }}>Vista de solo lectura del rendimiento de tus propiedades.</p>
      <label>
        Periodo
        <input
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          pattern="\d{4}-\d{2}"
        />
      </label>
      {kpis.isPending ? <p>Cargando indicadores…</p> : null}
      {kpis.isError ? <p>No fue posible cargar los indicadores.</p> : null}
      {kpis.data ? (
        <>
          <ul>
            <li>Ocupación: {(kpis.data.occupancy * 100).toFixed(1)}%</li>
            <li>Morosidad: {(kpis.data.delinquencyRate * 100).toFixed(1)}%</li>
          </ul>
          <h2>PyG por propiedad</h2>
          <ul>
            {kpis.data.perPropertyPnl.map((row) => (
              <li key={row.propertyId}>
                {row.propertyId}: recaudado {formatMinor(row.collectedMinor, row.currency)} — neto{" "}
                {formatMinor(row.netMinor, row.currency)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}
