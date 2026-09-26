import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RentalModule } from "../rental/rental.module";
import { GovernanceController } from "./governance.controller";
import { GovernanceService } from "./governance.service";
import { PrismaGovernanceStore } from "./prisma.store";
import { GOVERNANCE_STORE } from "./tokens";

@Module({
  imports: [AuthModule, RentalModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, { provide: GOVERNANCE_STORE, useClass: PrismaGovernanceStore }],
  exports: [GovernanceService],
})
export class GovernanceModule {}
