/**
 * SignRequestModule — P-9 Companion Redesign Task 0.6.
 *
 * Wire-up: TypeOrmModule.forFeature([SignRequest]) + service + controller.
 * Cron sweeper relies on ScheduleModule (already registered globally in
 * AppModule via existing `@nestjs/schedule` setup, so this module does not
 * re-register it).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignRequest } from './sign-request.entity';
import { SignRequestService } from './sign-request.service';
import { SignRequestController } from './sign-request.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SignRequest])],
  controllers: [SignRequestController],
  providers: [SignRequestService],
  exports: [SignRequestService],
})
export class SignRequestModule {}
