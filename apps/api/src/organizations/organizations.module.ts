import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { PrismaOrgsStore } from "./prisma.store";
import { ORGS_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, { provide: ORGS_STORE, useClass: PrismaOrgsStore }],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
