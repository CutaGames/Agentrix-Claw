import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Lightweight AWS Polly wrapper used by the video composer for narration.
 * Reuses the existing AWS credentials that power the voice module.
 */
@Injectable()
export class PollyTtsProvider {
  private readonly logger = new Logger(PollyTtsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async synthesize(opts: {
    text: string;
    voiceId?: string;
    outputFormat?: 'mp3' | 'ogg_vorbis' | 'pcm';
    language?: 'zh' | 'en';
  }): Promise<Buffer> {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.configService.get<string>('AWS_REGION') || 'ap-southeast-1';
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials missing — Polly cannot be used for narration. Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.');
    }

    const { PollyClient, SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly');
    const polly = new PollyClient({ region, credentials: { accessKeyId, secretAccessKey } });
    const voiceId = opts.voiceId || (opts.language === 'zh' ? 'Zhiyu' : 'Joanna');
    const command = new SynthesizeSpeechCommand({
      Text: opts.text,
      OutputFormat: opts.outputFormat || 'mp3',
      VoiceId: voiceId as any,
      Engine: 'neural',
      LanguageCode: opts.language === 'zh' ? 'cmn-CN' : 'en-US',
    });

    try {
      const res = await polly.send(command);
      if (!res.AudioStream) {
        throw new Error('Polly returned empty AudioStream');
      }
      const chunks: Buffer[] = [];
      // @ts-ignore streaming transform
      for await (const chunk of res.AudioStream as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err: any) {
      // Neural voice may not be available in region — retry with standard engine.
      this.logger.warn(`Polly neural synth failed (${err.message}); retrying with standard engine`);
      const fallback = new SynthesizeSpeechCommand({
        Text: opts.text,
        OutputFormat: opts.outputFormat || 'mp3',
        VoiceId: voiceId as any,
        Engine: 'standard',
        LanguageCode: opts.language === 'zh' ? 'cmn-CN' : 'en-US',
      });
      const res = await polly.send(fallback);
      if (!res.AudioStream) {
        throw new Error('Polly returned empty AudioStream even in standard engine');
      }
      const chunks: Buffer[] = [];
      // @ts-ignore streaming transform
      for await (const chunk of res.AudioStream as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
  }
}
