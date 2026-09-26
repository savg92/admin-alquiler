import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AiModule } from "../ai.module";
import { AiFeaturesController } from "./features.controller";
import { AiFeaturesService } from "./features.service";
import { PrismaAiSuggestionStore } from "./prisma.store";
import { AI_SUGGESTION_STORE } from "./tokens";

@Module({
  imports: [AuthModule, AiModule],
  controllers: [AiFeaturesController],
  providers: [
    AiFeaturesService,
    { provide: AI_SUGGESTION_STORE, useClass: PrismaAiSuggestionStore },
  ],
  exports: [AiFeaturesService],
})
export class AiFeaturesModule {}
