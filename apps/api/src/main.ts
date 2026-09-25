import "reflect-metadata";
import { validateEnv } from "@admin-alquiler/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { setupOpenApi } from "./openapi";

async function bootstrap() {
  const env = validateEnv("api");
  if (
    env.NODE_ENV === "production" &&
    !("JWT_SECRET" in env && env.JWT_SECRET)
  ) {
    throw new Error(
      "Invalid environment for api: JWT_SECRET is required in production",
    );
  }
  const app = await NestFactory.create(AppModule, { cors: true });
  setupOpenApi(app);

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`api listening on :${port}`);
}

void bootstrap();
