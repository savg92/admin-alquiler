import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { buildAuditEvent } from "@admin-alquiler/domain";
import { newSessionDates, signAccessToken, verifyPassword } from "@admin-alquiler/auth";
import { AUTH_CONFIG, AUTH_STORE, type AuthConfig, type AuthStore } from "./tokens";

export interface LoginResult {
  accessToken: string;
  user: { id: string; email: string; name: string };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async login(email: string, password: string, now: number = Date.now()): Promise<LoginResult> {
    const user = await this.store.findUserByEmail(email.toLowerCase().trim());
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid credentials.");
    }
    const dates = newSessionDates(now);
    const session = await this.store.createSession({
      userId: user.id,
      expiresAt: new Date(dates.expiresAt),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent(
        { actorId: user.id, action: "auth.login", entityType: "Session", entityId: session.id },
        now,
      ),
    );
    const accessToken = signAccessToken(
      this.config.jwtSecret,
      { id: user.id, email: user.email },
      session.id,
      now,
    );
    return { accessToken, user: { id: user.id, email: user.email, name: user.name } };
  }

  async logout(sessionId: string, actorId: string, now: number = Date.now()): Promise<void> {
    await this.store.deleteSession(sessionId);
    await this.store.writeAuditEvent(
      buildAuditEvent(
        { actorId, action: "auth.logout", entityType: "Session", entityId: sessionId },
        now,
      ),
    );
  }
}
