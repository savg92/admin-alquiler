import type { DataClass, RuntimeKind } from "./types";

export type PrivacyLevel = "local-only" | "local-preferred" | "provider-allowed";

const LOCAL_ONLY: DataClass[] = ["FINANCIAL", "LEGAL", "PERSONAL", "SENSITIVE", "CONFIDENTIAL"];

export function privacyLevelFor(classes: DataClass[]): PrivacyLevel {
  if (classes.some((entry) => LOCAL_ONLY.includes(entry))) {
    return "local-only";
  }
  if (classes.includes("INTERNAL")) {
    return "local-preferred";
  }
  return "provider-allowed";
}

export function allowedRuntimes(level: PrivacyLevel, providerConfigured: boolean): RuntimeKind[] {
  if (level === "local-only") {
    return ["local", "webgpu"];
  }
  if (level === "local-preferred") {
    return providerConfigured ? ["local", "webgpu", "provider"] : ["local", "webgpu"];
  }
  return providerConfigured ? ["local", "webgpu", "provider"] : ["local", "webgpu"];
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN =
  /(?<!\d)(?:\+?57[\s-]?)?(?:3\d{2}[\s-]?\d{3}[\s-]?\d{4}|60[1-8][\s-]?\d{3}[\s-]?\d{4})(?!\d)/g;

export function redactPersonal(text: string): { redacted: string; redactions: number } {
  let redactions = 0;
  const redacted = text
    .replace(EMAIL_PATTERN, () => {
      redactions += 1;
      return "[email]";
    })
    .replace(PHONE_PATTERN, () => {
      redactions += 1;
      return "[teléfono]";
    });
  return { redacted, redactions };
}

export function minimizeFields<T extends Record<string, unknown>>(
  payload: T,
  allowed: (keyof T)[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) {
      out[key] = payload[key];
    }
  }
  return out;
}
