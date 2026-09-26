export interface Session {
  token: string;
  orgId: string;
}

const TOKEN_KEY = "admin-alquiler.token";
const ORG_KEY = "admin-alquiler.org";

export function readSession(storage: Storage): Session | null {
  const token = storage.getItem(TOKEN_KEY);
  const orgId = storage.getItem(ORG_KEY);
  if (!token || !orgId) {
    return null;
  }
  return { token, orgId };
}

export function writeSession(storage: Storage, session: Session): void {
  storage.setItem(TOKEN_KEY, session.token);
  storage.setItem(ORG_KEY, session.orgId);
}

export function clearSession(storage: Storage): void {
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(ORG_KEY);
}

export async function login(email: string, password: string): Promise<{ accessToken: string }> {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`login failed: ${response.status}`);
  }
  return (await response.json()) as { accessToken: string };
}

export interface Membership {
  orgId: string;
  roleName: string;
  permissions: string[];
}

export async function myMemberships(session: Session): Promise<Membership[]> {
  const response = await fetch("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${session.token}`, "X-Org-Id": session.orgId },
  });
  if (!response.ok) {
    throw new Error(`session check failed: ${response.status}`);
  }
  const body = (await response.json()) as { memberships: Membership[] };
  return body.memberships.filter((entry) => entry.orgId === session.orgId);
}

export function authHeaders(session: Session): Record<string, string> {
  return { Authorization: `Bearer ${session.token}`, "X-Org-Id": session.orgId };
}
