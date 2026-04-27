import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DesktopUpdateController } from './desktop-update.controller';
import { DesktopUpdateService } from './desktop-update.service';

@Module({
  imports: [ConfigModule],
  controllers: [DesktopUpdateController],
  providers: [DesktopUpdateService],
  exports: [DesktopUpdateService],
})
export class DesktopUpdateModule {}