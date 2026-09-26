import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { PrismaDocumentsStore } from "./prisma.store";
import { DOCUMENTS_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, { provide: DOCUMENTS_STORE, useClass: PrismaDocumentsStore }],
  exports: [DocumentsService],
})
export class DocumentsModule {}
