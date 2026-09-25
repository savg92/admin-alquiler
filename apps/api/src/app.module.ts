import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common";
import { HealthController } from "./health.controller";
import { QueuesController } from "./queues.controller";
import { RequestIdMiddleware } from "./request-id.middleware";

@Module({
  controllers: [HealthController, QueuesController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
