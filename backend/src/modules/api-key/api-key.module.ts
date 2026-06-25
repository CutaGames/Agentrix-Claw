import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from '../../entities/api-key.entity';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
