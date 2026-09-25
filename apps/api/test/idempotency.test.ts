import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import {
  Controller,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Post,
  Req,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Request } from "express";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { RequestIdMiddleware } from "../src/request-id.middleware";

@Controller("test")
class EchoController {
  @Post("echo")
  echo(@Req() req: Request) {
    return { echo: req.body ?? null };
  }
}

@Module({ controllers: [EchoController] })
class IdempotencyTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(IdempotencyTestModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

function postEcho(payload: unknown, key?: string, org?: string) {
  return fetch(`${baseUrl}/test/echo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(org ? { "X-Org-Id": org } : {}),
    },
    body: JSON.stringify(payload),
  });
}

describe("Idempotency-Key convention", () => {
  test("POST without a key executes normally", async () => {
    const response = await postEcho({ amount: 100 });
    expect(response.status).toBe(201);
  });

  test("same key + same payload replays the original result", async () => {
    const key = `replay-${Date.now()}`;
    const first = await postEcho({ amount: 100 }, key);
    const firstBody = await first.json();
    const second = await postEcho({ amount: 100 }, key);
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(firstBody);
  });

  test("same key + different payload returns 409", async () => {
    const key = `conflict-${Date.now()}`;
    await postEcho({ amount: 100 }, key);
    const second = await postEcho({ amount: 200 }, key);
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  test("keys are scoped per organization", async () => {
    const key = `scoped-${Date.now()}`;
    const first = await postEcho({ amount: 100 }, key, "org-a");
    expect(first.status).toBe(201);
    const second = await postEcho({ amount: 200 }, key, "org-b");
    expect(second.status).toBe(201);
  });
});
