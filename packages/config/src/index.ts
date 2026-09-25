export type { ApiEnv, WebEnv, WorkerEnv } from "./env";
export { validateEnv } from "./env";

export type ServiceName = "api" | "worker" | "web";

export interface ServiceConfig {
  service: ServiceName;
  nodeEnv: string;
  port: number;
}

const DEFAULT_PORTS: Record<ServiceName, number> = {
  api: 3001,
  worker: 3002,
  web: 3000,
};

/**
 * Minimal config loader for the WS-1 scaffold. Full fail-fast env
 * validation (required secrets, schema) lands with the WS-1
 * environment-validation task in packages/config/src/env.ts.
 */
export function loadConfig(service: ServiceName): ServiceConfig {
  return {
    service,
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: Number(process.env[`${service.toUpperCase()}_PORT`] ?? DEFAULT_PORTS[service]),
  };
}
