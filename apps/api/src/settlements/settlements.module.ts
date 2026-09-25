import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaSettlementsStore } from "./prisma.store";
import { SettlementsController } from "./settlements.controller";
import { SettlementsService } from "./settlements.service";
import { SETTLEMENTS_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [SettlementsController],
  providers: [SettlementsService, { provide: SETTLEMENTS_STORE, useClass: PrismaSettlementsStore }],
  exports: [SettlementsService],
})
export class SettlementsModule {}
