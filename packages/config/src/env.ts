import { z } from "zod";

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const apiSchema = baseSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters")
    .optional(),
});

const workerSchema = baseSchema.extend({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
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
  const schema =
    service === "api"
      ? apiSchema
      : service === "worker"
        ? workerSchema
        : webSchema;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment for ${service}: ${details}`);
  }
  return parsed.data;
}
