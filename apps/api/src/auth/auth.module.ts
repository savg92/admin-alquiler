import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt.guard";
import { PermissionsGuard } from "./permissions.guard";
import { PrismaAuthStore } from "./prisma.store";
import { AUTH_CONFIG, AUTH_STORE } from "./tokens";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Invalid environment for api: JWT_SECRET is required in production");
  }
  return "dev-only-secret-not-for-production-0123456789";
}

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useClass: PrismaAuthStore },
    { provide: AUTH_CONFIG, useFactory: () => ({ jwtSecret: resolveJwtSecret() }) },
  ],
  exports: [AuthService, JwtAuthGuard, PermissionsGuard, AUTH_STORE, AUTH_CONFIG],
})
export class AuthModule {}
