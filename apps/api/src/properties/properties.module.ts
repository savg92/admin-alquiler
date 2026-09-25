import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaPropertiesStore } from "./prisma.store";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";
import { PROPERTIES_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [PropertiesController],
  providers: [PropertiesService, { provide: PROPERTIES_STORE, useClass: PrismaPropertiesStore }],
  exports: [PropertiesService],
})
export class PropertiesModule {}
