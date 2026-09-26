import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommunicationsController } from "./communications.controller";
import { CommunicationsService } from "./communications.service";
import { PrismaCommunicationsStore } from "./prisma.store";
import { COMMUNICATIONS_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [CommunicationsController],
  providers: [
    CommunicationsService,
    { provide: COMMUNICATIONS_STORE, useClass: PrismaCommunicationsStore },
  ],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
