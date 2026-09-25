import type { MembershipStatus } from "@admin-alquiler/permissions";

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
}

export interface SessionRow {
  id: string;
  userId: string;
  expiresAt: Date;
  rotatedAt: Date | null;
}

export interface MembershipRow {
  orgId: string;
  status: MembershipStatus;
  roleName: string;
  permissions: string[];
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<UserRow | null>;
  findUserById(id: string): Promise<UserRow | null>;
  createSession(data: { userId: string; expiresAt: Date }): Promise<{ id: string }>;
  findSessionById(id: string): Promise<SessionRow | null>;
  touchSession(id: string, rotatedAt: Date, expiresAt: Date): Promise<void>;
  deleteSession(id: string): Promise<void>;
  listMemberships(userId: string): Promise<MembershipRow[]>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
