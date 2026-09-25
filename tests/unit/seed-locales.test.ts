import { describe, expect, test } from "bun:test";
import { resolveSeedLocale, supportedLocales } from "@admin-alquiler/database";

describe("seed locales", () => {
  test("Colombia ships first with es-CO/CO/COP", () => {
    const seedLocale = resolveSeedLocale("es-CO");
    expect(seedLocale).toEqual({
      locale: "es-CO",
      country: "CO",
      currency: "COP",
      timezone: "America/Bogota",
    });
    expect(supportedLocales()).toEqual(["es-CO"]);
  });

  test("unsupported locales fail fast", () => {
    expect(() => resolveSeedLocale("es-MX")).toThrow(/Unsupported seed locale/);
  });
});
