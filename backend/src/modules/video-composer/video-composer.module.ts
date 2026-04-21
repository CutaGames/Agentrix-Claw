import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VideoGenerationModule } from '../video-generation/video-generation.module';
import { VideoComposerService } from './video-composer.service';
import { PollyTtsProvider } from './polly-tts.provider';

@Module({
  imports: [ConfigModule, VideoGenerationModule],
  providers: [VideoComposerService, PollyTtsProvider],
  exports: [VideoComposerService],
})
export class VideoComposerModule {}
