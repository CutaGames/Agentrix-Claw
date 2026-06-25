import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationCode } from '../../entities/invitation-code.entity';
import { InvitationService } from './invitation.service';
import {
  InvitationController,
  InvitationAdminController,
} from './invitation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InvitationCode])],
  controllers: [InvitationController, InvitationAdminController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
