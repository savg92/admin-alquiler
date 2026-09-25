import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "@admin-alquiler/auth";

describe("password authentication", () => {
  test("hash verifies with the correct password", () => {
    const stored = hashPassword("correct-horse-1");
    expect(verifyPassword("correct-horse-1", stored)).toBe(true);
  });

  test("wrong password fails verification", () => {
    const stored = hashPassword("correct-horse-1");
    expect(verifyPassword("wrong-password-2", stored)).toBe(false);
  });

  test("hashes use unique salts", () => {
    expect(hashPassword("same-password-1")).not.toBe(hashPassword("same-password-1"));
  });

  test("short passwords are rejected", () => {
    expect(() => hashPassword("short")).toThrow(/at least 8 characters/);
  });

  test("malformed stored values fail closed", () => {
    expect(verifyPassword("anything-123", "not-a-hash")).toBe(false);
    expect(verifyPassword("anything-123", "scrypt:only-two")).toBe(false);
    expect(verifyPassword("anything-123", "")).toBe(false);
  });

  test("seed-compatible scrypt format verifies", () => {
    const stored = hashPassword("change-me");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(verifyPassword("change-me", stored)).toBe(true);
  });
});
