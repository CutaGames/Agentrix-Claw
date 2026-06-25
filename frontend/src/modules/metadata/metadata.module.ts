import { Module } from '@nestjs/common';
import { MetadataStorageService } from './metadata-storage.service';

@Module({
  providers: [MetadataStorageService],
  exports: [MetadataStorageService],
})
export class MetadataModule {}

