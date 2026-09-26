import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RentalModule } from "../rental/rental.module";
import { DirectoryController } from "./directory.controller";
import { DirectoryService } from "./directory.service";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";
import { PrismaOperationsStore } from "./prisma.store";
import { OPERATIONS_STORE } from "./tokens";

@Module({
  imports: [AuthModule, RentalModule],
  controllers: [DirectoryController, MaintenanceController],
  providers: [
    DirectoryService,
    MaintenanceService,
    { provide: OPERATIONS_STORE, useClass: PrismaOperationsStore },
  ],
  exports: [DirectoryService, MaintenanceService],
})
export class OperationsModule {}
