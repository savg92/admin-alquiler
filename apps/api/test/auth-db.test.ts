import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { prisma } from "@admin-alquiler/database";
import { verifyAccessToken } from "@admin-alquiler/auth";
import { AuthService } from "../src/auth/auth.service";
import { PrismaAuthStore } from "../src/auth/prisma.store";

async function isDatabaseReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const dbReachable = await isDatabaseReachable();

describe.skipIf(!dbReachable)("auth against a real database", () => {
  test("seed admin can log in and the token verifies", async () => {
    const service = new AuthService(new PrismaAuthStore(), {
      jwtSecret: "test-secret-with-at-least-32-characters!!",
    });
    const result = await service.login("admin@ejemplo.co", "change-me");
    expect(result.user.email).toBe("admin@ejemplo.co");
    const verified = verifyAccessToken(
      "test-secret-with-at-least-32-characters!!",
      result.accessToken,
    );
    expect(verified.ok).toBe(true);
    const memberships = await new PrismaAuthStore().listMemberships(result.user.id);
    expect(memberships.length).toBeGreaterThan(0);
    await service.logout(verified.ok ? verified.claims.sessionId : "", result.user.id);
  });

  test("wrong password fails against a real database", async () => {
    const service = new AuthService(new PrismaAuthStore(), {
      jwtSecret: "test-secret-with-at-least-32-characters!!",
    });
    await expect(service.login("admin@ejemplo.co", "wrong-password-2")).rejects.toThrow();
  });
});
