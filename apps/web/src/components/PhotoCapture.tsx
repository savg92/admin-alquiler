import { useRef, useState } from "react";
import { authHeaders, type Session } from "../auth/session";
import { OfflineQueue } from "../offline/queue";

export type AttachmentKind = "PHOTO" | "RECORD" | "DOCUMENT";

interface Props {
  session: Session;
  propertyId: string;
  unitId?: string;
  kind: AttachmentKind;
  onDone?: (storageKey: string) => void;
}

function storageKeyFor(file: File): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `uploads/${stamp}-${safeName}`;
}

export function PhotoCapture({ session, propertyId, unitId, kind, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const pick = (next: File | null) => {
    setFile(next);
    setStatus(null);
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(next ? URL.createObjectURL(next) : null);
  };

  const upload = async () => {
    if (!file) {
      return;
    }
    setStatus("Subiendo…");
    const payload = JSON.stringify({
      ...(unitId === undefined ? {} : { unitId }),
      kind,
      storageKey: storageKeyFor(file),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      capturedAt: new Date().toISOString(),
    });
    const url = `/api/v1/properties/${propertyId}/attachments`;
    if (!navigator.onLine) {
      new OfflineQueue(localStorage).enqueue({
        url,
        body: payload,
        headers: authHeaders(session),
      });
      setStatus("Sin conexión — registro encolado para sincronizar.");
      return;
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(session) },
      body: payload,
    });
    if (response.status === 409) {
      setStatus("El registro ya existe en el servidor (se conserva el del servidor).");
      return;
    }
    if (!response.ok) {
      new OfflineQueue(localStorage).enqueue({
        url,
        body: payload,
        headers: authHeaders(session),
      });
      setStatus("Falló el envío — registro encolado para reintentar.");
      return;
    }
    const created = (await response.json()) as { storageKey: string };
    setStatus("Registro guardado.");
    onDone?.(created.storageKey);
  };

  return (
    <section aria-label="Captura de foto">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(event) => pick(event.target.files?.[0] ?? null)}
      />
      <button type="button" onClick={() => inputRef.current?.click()}>
        Tomar foto
      </button>{" "}
      <button type="button" onClick={upload} disabled={!file}>
        Subir registro
      </button>
      {preview ? (
        <img
          src={preview}
          alt="Vista previa de la foto capturada"
          style={{ display: "block", maxWidth: "100%", marginTop: 8, borderRadius: 8 }}
        />
      ) : null}
      {status ? (
        <p role="status" style={{ color: "#475569" }}>
          {status}
        </p>
      ) : null}
    </section>
  );
}
