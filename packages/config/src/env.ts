import { z } from "zod";

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const aiFlags = {
  AI_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AI_WEBGPU_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AI_LOCAL_MODELS: z.string().default(""),
  AI_LOCAL_BASE_URL: z.string().default("http://localhost:8080"),
  AI_EXTERNAL_PROVIDER: z.string().default(""),
  AI_PROVIDER_BASE_URL: z.string().default(""),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  AI_DECISION_PROVIDER: z.enum(["laya", "jev"]).default("laya"),
  AI_DECISION_BASE_URL: z.string().default("http://localhost:8090"),
  AI_DECISION_MODEL: z.string().default("laya"),
  AI_DECISION_API_KEY: z.string().optional(),
};

const apiSchema = baseSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  ...aiFlags,
});

const workerSchema = baseSchema.extend({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  ...aiFlags,
});

const webSchema = baseSchema.extend({
  WEB_PORT: z.coerce.number().int().positive().default(3000),
});

export type ApiEnv = z.infer<typeof apiSchema>;
export type WorkerEnv = z.infer<typeof workerSchema>;
export type WebEnv = z.infer<typeof webSchema>;

export function validateEnv(
  service: "api" | "worker" | "web",
  env: NodeJS.ProcessEnv = process.env,
): ApiEnv | WorkerEnv | WebEnv {
  const schema = service === "api" ? apiSchema : service === "worker" ? workerSchema : webSchema;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment for ${service}: ${details}`);
  }
  return parsed.data;
}

export interface AiConfig {
  enabled: boolean;
  webgpuEnabled: boolean;
  localModels: string[];
  localBaseUrl: string;
  externalProvider: string;
  providerBaseUrl: string;
  providerApiKey: string | null;
  timeoutMs: number;
  maxRetries: number;
  decisionProvider: "laya" | "jev";
  decisionBaseUrl: string;
  decisionModel: string;
  decisionApiKey: string | null;
}

function parseBooleanFlag(value: string | undefined): boolean {
  return value === "true";
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const timeoutMs = Number(env.AI_TIMEOUT_MS ?? 15000);
  const maxRetries = Number(env.AI_MAX_RETRIES ?? 2);
  return {
    enabled: parseBooleanFlag(env.AI_ENABLED),
    webgpuEnabled: parseBooleanFlag(env.AI_WEBGPU_ENABLED),
    localModels: parseList(env.AI_LOCAL_MODELS),
    localBaseUrl: env.AI_LOCAL_BASE_URL ?? "http://localhost:8080",
    externalProvider: (env.AI_EXTERNAL_PROVIDER ?? "").trim(),
    providerBaseUrl: (env.AI_PROVIDER_BASE_URL ?? "").trim(),
    providerApiKey: env.AI_PROVIDER_API_KEY ?? null,
    timeoutMs: Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
    maxRetries: Number.isInteger(maxRetries) && maxRetries >= 0 && maxRetries <= 5 ? maxRetries : 2,
    decisionProvider: env.AI_DECISION_PROVIDER === "jev" ? "jev" : "laya",
    decisionBaseUrl: env.AI_DECISION_BASE_URL ?? "http://localhost:8090",
    decisionModel: env.AI_DECISION_MODEL ?? "laya",
    decisionApiKey: env.AI_DECISION_API_KEY ?? null,
  };
}
