import { Module } from '@nestjs/common';
import { MockWebsiteController } from './mock-website.controller';

@Module({
  controllers: [MockWebsiteController],
})
export class MockWebsiteModule {}

