import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DocumentsModule } from "../documents/documents.module";
import { RentalModule } from "../rental/rental.module";
import { CasesController } from "./cases.controller";
import { CasesService } from "./cases.service";
import { DirectoryController } from "./directory.controller";
import { DirectoryService } from "./directory.service";
import { HandoverController } from "./handover.controller";
import { HandoverService } from "./handover.service";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";
import { PrismaOperationsStore } from "./prisma.store";
import { OPERATIONS_STORE } from "./tokens";

@Module({
  imports: [AuthModule, DocumentsModule, RentalModule],
  controllers: [CasesController, DirectoryController, HandoverController, MaintenanceController],
  providers: [
    CasesService,
    DirectoryService,
    HandoverService,
    MaintenanceService,
    { provide: OPERATIONS_STORE, useClass: PrismaOperationsStore },
  ],
  exports: [CasesService, DirectoryService, HandoverService, MaintenanceService],
})
export class OperationsModule {}
