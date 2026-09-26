import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CommunicationsModule } from "./communications/communications.module";
import { FinanceModule } from "./finance/finance.module";
import { HealthController } from "./health.controller";
import { OrganizationsModule } from "./organizations/organizations.module";
import { PropertiesModule } from "./properties/properties.module";
import { RentalModule } from "./rental/rental.module";
import { ReportsModule } from "./reports/reports.module";
import { SettlementsModule } from "./settlements/settlements.module";
import { IdempotencyMiddleware } from "./idempotency/middleware";
import { QueuesController } from "./queues.controller";
import { RequestIdMiddleware } from "./request-id.middleware";

@Module({
  imports: [
    AuthModule,
    CommunicationsModule,
    FinanceModule,
    OrganizationsModule,
    PropertiesModule,
    RentalModule,
    ReportsModule,
    SettlementsModule,
  ],
  controllers: [HealthController, QueuesController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}
