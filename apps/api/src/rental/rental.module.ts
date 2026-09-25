import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaRentalStore } from "./prisma.store";
import { RentalController } from "./rental.controller";
import { RentalService } from "./rental.service";
import { RENTAL_STORE } from "./tokens";

@Module({
  imports: [AuthModule],
  controllers: [RentalController],
  providers: [RentalService, { provide: RENTAL_STORE, useClass: PrismaRentalStore }],
  exports: [RentalService],
})
export class RentalModule {}
