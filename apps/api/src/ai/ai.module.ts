import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiObservabilityService } from "./observability";
import { PrismaAiStore } from "./prisma.store";
import { RegistryService } from "./registry.service";
import { AI_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [
    AiService,
    RegistryService,
    AiObservabilityService,
    { provide: AI_STORE, useClass: PrismaAiStore },
  ],
  exports: [AiService, RegistryService, AiObservabilityService],
})
export class AiModule {}
