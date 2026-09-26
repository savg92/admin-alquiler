import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaReportsStore } from "./prisma.store";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { REPORTS_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, { provide: REPORTS_STORE, useClass: PrismaReportsStore }],
  exports: [ReportsService],
})
export class ReportsModule {}
