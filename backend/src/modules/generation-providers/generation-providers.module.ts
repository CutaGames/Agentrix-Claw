import { Module } from '@nestjs/common';
import { GenerationProvidersController } from './generation-providers.controller';

@Module({
  controllers: [GenerationProvidersController],
  exports: [],
})
export class GenerationProvidersModule {}
