export const AUTH_STORE = Symbol("AUTH_STORE");
export const AUTH_CONFIG = Symbol("AUTH_CONFIG");

export interface AuthConfig {
  jwtSecret: string;
}

export type { AuthStore } from "./store";
