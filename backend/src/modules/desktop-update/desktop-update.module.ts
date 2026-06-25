import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesktopUpdateController } from './desktop-update.controller';
import { DesktopUpdateService } from './desktop-update.service';
import { DesktopReleaseEntity } from '../../entities/desktop-release.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([DesktopReleaseEntity]),
  ],
  controllers: [DesktopUpdateController],
  providers: [DesktopUpdateService],
  exports: [DesktopUpdateService],
})
export class DesktopUpdateModule {}