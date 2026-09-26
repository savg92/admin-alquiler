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
