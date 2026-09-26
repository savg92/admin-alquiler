import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";
import { PrismaOperationsStore } from "./prisma.store";
import { OPERATIONS_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, { provide: OPERATIONS_STORE, useClass: PrismaOperationsStore }],
  exports: [MaintenanceService],
})
export class OperationsModule {}
