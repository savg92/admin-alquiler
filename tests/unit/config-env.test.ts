import { describe, expect, test } from "bun:test";
import { validateEnv } from "@admin-alquiler/config";

describe("validateEnv", () => {
  test("api requires DATABASE_URL", () => {
    expect(() =>
      validateEnv("api", { NODE_ENV: "test" } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });

  test("api passes with DATABASE_URL", () => {
    const env = validateEnv("api", {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://localhost:5432/test",
    });
    expect(env.NODE_ENV).toBe("test");
  });

  test("web needs no secrets", () => {
    const env = validateEnv("web", { NODE_ENV: "test" });
    expect(env.NODE_ENV).toBe("test");
  });
});
