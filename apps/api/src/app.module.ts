import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { PropertiesModule } from "./properties/properties.module";
import { IdempotencyMiddleware } from "./idempotency/middleware";
import { QueuesController } from "./queues.controller";
import { RequestIdMiddleware } from "./request-id.middleware";

@Module({
  imports: [AuthModule, PropertiesModule],
  controllers: [HealthController, QueuesController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}
