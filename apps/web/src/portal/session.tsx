import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  authHeaders,
  clearSession,
  login,
  myMemberships,
  readSession,
  writeSession,
  type Membership,
  type Session,
} from "../auth/session";
import { hasAllPermissions } from "./guard";

export function useSession(): {
  session: Session | null;
  memberships: Membership[];
  signIn: (email: string, password: string, orgId: string) => Promise<void>;
  signOut: () => void;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  useEffect(() => {
    setSession(readSession(localStorage));
  }, []);

  useEffect(() => {
    if (!session) {
      setMemberships([]);
      return;
    }
    void myMemberships(session)
      .then(setMemberships)
      .catch(() => setMemberships([]));
  }, [session]);

  return {
    session,
    memberships,
    signIn: async (email: string, password: string, orgId: string) => {
      const { accessToken } = await login(email, password);
      const next = { token: accessToken, orgId };
      writeSession(localStorage, next);
      setSession(next);
    },
    signOut: () => {
      clearSession(localStorage);
      setSession(null);
    },
  };
}

export function LoginForm({ onDone }: { onDone: () => void }) {
  const { session, signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (session) {
    onDone();
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await signIn(email, password, orgId);
      onDone();
    } catch {
      setError("No fue posible iniciar sesión.");
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
      <label>
        Correo
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <label>
        Organización (ID)
        <input value={orgId} onChange={(event) => setOrgId(event.target.value)} required />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit">Entrar</button>
    </form>
  );
}

export function RequirePermissions({
  memberships,
  required,
  children,
}: {
  memberships: Membership[];
  required: string[];
  children: ReactNode;
}) {
  if (!hasAllPermissions(memberships, required)) {
    return <p>Tu rol no tiene acceso a esta sección ({required.join(", ")}).</p>;
  }
  return <>{children}</>;
}

export { authHeaders };
