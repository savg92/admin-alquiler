import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CommunicationsModule } from "./communications/communications.module";
import { DocumentsModule } from "./documents/documents.module";
import { FinanceModule } from "./finance/finance.module";
import { GovernanceModule } from "./governance/governance.module";
import { HealthController } from "./health.controller";
import { OrganizationsModule } from "./organizations/organizations.module";
import { OperationsModule } from "./operations/operations.module";
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
    DocumentsModule,
    FinanceModule,
    GovernanceModule,
    OperationsModule,
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
