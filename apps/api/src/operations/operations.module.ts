import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RentalModule } from "../rental/rental.module";
import { CasesController } from "./cases.controller";
import { CasesService } from "./cases.service";
import { DirectoryController } from "./directory.controller";
import { DirectoryService } from "./directory.service";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";
import { PrismaOperationsStore } from "./prisma.store";
import { OPERATIONS_STORE } from "./tokens";

@Module({
  imports: [AuthModule, RentalModule],
  controllers: [CasesController, DirectoryController, MaintenanceController],
  providers: [
    CasesService,
    DirectoryService,
    MaintenanceService,
    { provide: OPERATIONS_STORE, useClass: PrismaOperationsStore },
  ],
  exports: [CasesService, DirectoryService, MaintenanceService],
})
export class OperationsModule {}
