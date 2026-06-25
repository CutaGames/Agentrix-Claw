import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WikiPage } from '../../entities/wiki-page.entity';
import { MemoryWikiService } from './memory-wiki.service';
import { MemoryWikiController } from './memory-wiki.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WikiPage])],
  controllers: [MemoryWikiController],
  providers: [MemoryWikiService],
  exports: [MemoryWikiService],
})
export class MemoryWikiModule {}
