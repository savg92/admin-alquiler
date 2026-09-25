import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { PrismaFinanceStore } from "./prisma.store";
import { FINANCE_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [FinanceController],
  providers: [FinanceService, { provide: FINANCE_STORE, useClass: PrismaFinanceStore }],
  exports: [FinanceService],
})
export class FinanceModule {}
