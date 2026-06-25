import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlashCommand } from '../../entities/slash-command.entity';
import { SlashCommandService } from './slash-command.service';
import { SlashCommandController } from './slash-command.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SlashCommand])],
  providers: [SlashCommandService],
  controllers: [SlashCommandController],
  exports: [SlashCommandService],
})
export class SlashCommandModule {}
