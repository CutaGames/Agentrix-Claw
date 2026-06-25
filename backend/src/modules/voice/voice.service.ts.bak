import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private openai: OpenAI;

  constructor() {
    // Use OpenAI key if set; AWS Bedrock doesn't cover Whisper so we need OpenAI
    // or fall back to a stub if no key provided
    const apiKey = process.env.OPENAI_API_KEY || '';
    this.openai = new OpenAI({ apiKey: apiKey || 'not-set' });
  }

  /**
   * Transcribe audio buffer using OpenAI Whisper.
   * Falls back to stub if no OPENAI_API_KEY is configured.
   */
  async transcribe(
    buffer: Buffer,
    mimetype: string,
    originalName: string,
  ): Promise<{ transcript: string }> {
    if (!process.env.OPENAI_API_KEY) {
      // Graceful stub — return empty so mobile shows manual-input prompt
      this.logger.warn('OPENAI_API_KEY not set, returning empty transcript');
      return { transcript: '' };
    }

    // Write to temp file (OpenAI SDK requires a file path or ReadStream)
    const ext = originalName.split('.').pop() || 'm4a';
    const tmpPath = path.join(os.tmpdir(), `voice_${Date.now()}.${ext}`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      const fileStream = fs.createReadStream(tmpPath);

      const response = await this.openai.audio.transcriptions.create({
        file: fileStream as any,
        model: 'whisper-1',
        response_format: 'text',
      });

      const transcript =
        typeof response === 'string' ? response : (response as any).text || '';
      return { transcript };
    } catch (err: any) {
      this.logger.error('Whisper transcription failed', err?.message);
      throw new BadRequestException(`Transcription failed: ${err?.message}`);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  }
}
