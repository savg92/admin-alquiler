import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { verifyAccessToken } from "@admin-alquiler/auth";
import type { MembershipRow } from "./store";
import { AUTH_CONFIG, AUTH_STORE, type AuthConfig, type AuthStore } from "./tokens";

export interface RequestActor {
  userId: string;
  email: string;
  sessionId: string;
  memberships: MembershipRow[];
}

declare module "express" {
  interface Request {
    actor?: RequestActor;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: unknown = request.headers?.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      return false;
    }
    const verified = verifyAccessToken(this.config.jwtSecret, header.slice("Bearer ".length));
    if (!verified.ok) {
      return false;
    }
    const session = await this.store.findSessionById(verified.claims.sessionId);
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      session.userId !== verified.claims.sub
    ) {
      return false;
    }
    const memberships = await this.store.listMemberships(verified.claims.sub);
    request.actor = {
      userId: verified.claims.sub,
      email: verified.claims.email,
      sessionId: session.id,
      memberships,
    };
    return true;
  }
}
