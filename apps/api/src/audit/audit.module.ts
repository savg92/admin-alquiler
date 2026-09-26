import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { PrismaAuditStore } from "./prisma.store";
import { AUDIT_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService, { provide: AUDIT_STORE, useClass: PrismaAuditStore }],
  exports: [AuditService],
})
export class AuditModule {}
