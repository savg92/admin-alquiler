export interface SeedLocale {
  locale: string;
  country: string;
  currency: string;
  timezone: string;
}

const SUPPORTED_LOCALES: Record<string, SeedLocale> = {
  "es-CO": {
    locale: "es-CO",
    country: "CO",
    currency: "COP",
    timezone: "America/Bogota",
  },
};

export function supportedLocales(): string[] {
  return Object.keys(SUPPORTED_LOCALES);
}

export function resolveSeedLocale(input?: string): SeedLocale {
  const key = input ?? process.env.SEED_LOCALE ?? "es-CO";
  const found = SUPPORTED_LOCALES[key];
  if (!found) {
    throw new Error(
      `Unsupported seed locale "${key}". Supported: ${supportedLocales().join(", ")}`,
    );
  }
  return found;
}
