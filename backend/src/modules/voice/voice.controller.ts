import { Controller, Post, Get, Query, Res, Request, UseInterceptors, UploadedFile, UseGuards, BadRequestException, Logger, Body } from '@nestjs/common';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VoiceService } from './voice.service';
import { edgeTTSStream, resolveEdgeVoice } from './adapters/edge-tts.adapter';
import { GeminiLiveAdapter } from './adapters/gemini-live.adapter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProviderConfig } from '../../entities/user-provider-config.entity';

@ApiTags('Voice')
@Controller('voice')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name);
  private readonly geminiAdapter = new GeminiLiveAdapter();

  constructor(
    private readonly voiceService: VoiceService,
    @InjectRepository(UserProviderConfig)
    private readonly providerConfigRepo: Repository<UserProviderConfig>,
  ) {}

  /**
   * TTS provider order: gemini_free → edge → polly
   * OUTPUT chain: Gemini Free → Edge TTS → AWS Polly
   * (Skip Gemini paid for output — $12/M tokens too expensive)
   */
  private getTTSProviderOrder(): Array<'gemini' | 'edge' | 'polly'> {
    const configured = (process.env.VOICE_TTS_PROVIDER || 'gemini,edge,polly')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v): v is 'gemini' | 'edge' | 'polly' => v === 'gemini' || v === 'edge' || v === 'polly');
    return configured.length > 0 ? configured : ['gemini', 'edge', 'polly'];
  }

  /**
   * Check if user has their own AI provider configured (e.g. Bedrock, OpenAI).
   * If they do, skip Gemini voice and use the traditional pipeline.
   */
  private async userHasCustomProvider(userId: string): Promise<boolean> {
    if (!userId) return false;
    const count = await this.providerConfigRepo.count({ where: { userId, isActive: true } });
    return count > 0;
  }

  @Get('tts')
  @ApiOperation({ summary: 'Text-to-speech synthesis (Edge TTS default, Polly fallback)' })
  async synthesizeTTS(
    @Request() req,
    @Query('text') text: string,
    @Query('lang') lang: string,
    @Query('voice') requestedVoice: string,
    @Query('rate') rateParam: string,
    @Res() res: Response,
  ) {
    if (!text) throw new BadRequestException('Text is required');

    // If user has their own API provider, skip Gemini TTS — use traditional pipeline only
    const userId = req?.user?.id || req?.user?.sub;
    const hasCustom = userId ? await this.userHasCustomProvider(userId) : false;

    // Truncate to prevent abuse
    const truncated = text.slice(0, 2000);
    const isChinese = lang === 'zh' || (!lang && /[\u4e00-\u9fff]/.test(truncated));

    // Convert numeric rate (e.g. "1.2") to Edge TTS percentage format ("+20%")
    let edgeRate: string | undefined;
    if (rateParam) {
      const numeric = parseFloat(rateParam);
      if (!isNaN(numeric) && numeric >= 0.5 && numeric <= 2.0) {
        const pct = Math.round((numeric - 1.0) * 100);
        edgeRate = pct >= 0 ? `+${pct}%` : `${pct}%`;
      }
    }

    for (const provider of this.getTTSProviderOrder()) {
      try {
        if (provider === 'gemini' && process.env.VOICE_ENABLE_GEMINI === 'true' && this.geminiAdapter.isAvailable && !hasCustom) {
          const result = await this.geminiAdapter.synthesizeSpeech(truncated, isChinese ? 'zh' : 'en');
          if (result) {
            this.logger.log(`Gemini TTS success (tier=${result.tier})`);
            // Gemini returns PCM audio — convert to WAV header for browser playback
            const pcmBuf = Buffer.from(result.audioBase64, 'base64');
            const wavBuf = this.pcmToWav(pcmBuf, 24000, 1, 16);
            res.set({ 'Content-Type': 'audio/wav', 'Content-Length': String(wavBuf.length) });
            res.end(wavBuf);
            return;
          }
        }
        if (provider === 'edge') {
          await this.synthesizeWithEdge(truncated, isChinese, requestedVoice, res, edgeRate);
          return;
        }
        if (provider === 'polly' && process.env.AWS_ACCESS_KEY_ID) {
          await this.synthesizeWithPolly(truncated, isChinese, requestedVoice, res);
          return;
        }
      } catch (err: any) {
        this.logger.warn(`TTS provider ${provider} failed: ${err.message}`);
      }
    }

    res.status(500).json({ message: 'All TTS providers failed' });
  }

  /** Edge TTS — free, streaming, high quality */
  private synthesizeWithEdge(
    text: string,
    isChinese: boolean,
    requestedVoice: string | undefined,
    res: Response,
    rate?: string,
  ): Promise<void> {
    const voice = resolveEdgeVoice(requestedVoice, isChinese);
    this.logger.debug(`Edge TTS: voice=${voice}, len=${text.length}, rate=${rate || '+0%'}`);

    return new Promise((resolve, reject) => {
      let headersSent = false;

      edgeTTSStream(
        text,
        { voice, ...(rate ? { rate } : {}) },
        (chunk) => {
          if (!headersSent) {
            res.set({ 'Content-Type': 'audio/mpeg', 'Transfer-Encoding': 'chunked' });
            headersSent = true;
          }
          res.write(chunk);
        },
        () => {
          if (!headersSent) {
            // Edge returned no audio — let fallback handle it
            reject(new Error('Edge TTS returned no audio'));
            return;
          }
          res.end();
          resolve();
        },
        (err) => {
          if (headersSent) {
            // Already streaming — just end
            res.end();
            resolve();
          } else {
            reject(err);
          }
        },
      );
    });
  }

  /** AWS Polly — paid fallback */
  private async synthesizeWithPolly(
    text: string,
    isChinese: boolean,
    requestedVoice: string | undefined,
    res: Response,
  ): Promise<void> {
    const polly = new PollyClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    let voiceId = isChinese ? 'Zhiyu' : 'Matthew';
    if (requestedVoice) {
      const voiceMap: Record<string, Record<string, string>> = {
        alloy:   { en: 'Matthew', zh: 'Zhiyu' },
        echo:    { en: 'Stephen', zh: 'Zhiqiang' },
        fable:   { en: 'Kendra', zh: 'Zhiyu' },
        onyx:    { en: 'Kevin',   zh: 'Zhiqiang' },
        nova:    { en: 'Ruth',    zh: 'Zhiyu' },
        shimmer: { en: 'Salli',   zh: 'Zhiyu' },
      };
      const mapping = voiceMap[requestedVoice.toLowerCase()];
      if (mapping) {
        voiceId = isChinese ? mapping.zh : mapping.en;
      } else {
        voiceId = requestedVoice;
      }
    }

    const languageCode = isChinese ? 'cmn-CN' : 'en-US';

    try {
      const command = new SynthesizeSpeechCommand({
        Engine: 'neural',
        VoiceId: voiceId as any,
        LanguageCode: languageCode,
        OutputFormat: 'mp3',
        Text: text,
      });
      const response = await polly.send(command);
      if (response.AudioStream) {
        res.set({ 'Content-Type': 'audio/mpeg', 'Transfer-Encoding': 'chunked' });
        (response.AudioStream as any).pipe(res);
      } else {
        throw new Error('Polly returned no audio stream');
      }
    } catch (err: any) {
      if (err.name === 'ValidationException') {
        const fallbackCmd = new SynthesizeSpeechCommand({
          Engine: 'standard',
          VoiceId: voiceId as any,
          LanguageCode: languageCode,
          OutputFormat: 'mp3',
          Text: text,
        });
        const response = await polly.send(fallbackCmd);
        if (response.AudioStream) {
          res.set({ 'Content-Type': 'audio/mpeg', 'Transfer-Encoding': 'chunked' });
          (response.AudioStream as any).pipe(res);
        } else {
          throw new Error('Polly standard fallback returned no audio');
        }
      } else {
        throw err;
      }
    }
  }


  @Post('companion-crash')
  @ApiOperation({ summary: 'Report a mobile companion ball mount crash (telemetry)' })
  async companionCrash(@Request() req, @Body() body: { slot?: string; message?: string; stack?: string; platform?: string; appVersion?: string }) {
    const userId = req?.user?.id || req?.user?.sub || 'unknown';
    this.logger.warn(
      `[COMPANION-CRASH] user=${userId} slot=${body?.slot || '?'} platform=${body?.platform || '?'} ` +
      `v=${body?.appVersion || '?'} msg=${JSON.stringify(body?.message || '')}\nstack=${(body?.stack || '').slice(0, 1200)}`,
    );
    return { ok: true };
  }

  @Post('transcribe-json')
  @ApiOperation({ summary: 'Transcribe base64 audio (JSON body) — reliable upload path for RN where multipart fetch hangs' })
  async transcribeJson(
    @Request() req,
    @Body() body: { audioBase64?: string; mimeType?: string; lang?: string; filename?: string },
  ) {
    if (!body?.audioBase64) {
      throw new BadRequestException('No audioBase64 provided.');
    }
    const buf = Buffer.from(body.audioBase64, 'base64');
    const mimeType = body.mimeType || 'audio/m4a';
    const filename = body.filename || `voice.${(mimeType.split('/')[1] || 'm4a').split(';')[0]}`;
    this.logger.log(`[transcribe-json] received ${buf.length}B mime=${mimeType} lang=${body.lang || 'auto'}`);
    if (buf.length === 0) {
      throw new BadRequestException('Empty audio payload.');
    }
    const userId = req?.user?.id || req?.user?.sub;
    const hasCustom = userId ? await this.userHasCustomProvider(userId) : false;
    const started = Date.now();
    try {
      const result = await this.voiceService.transcribe(buf, mimeType, filename, body.lang, { useGeminiSTT: !hasCustom });
      this.logger.log(`[transcribe-json] done in ${Date.now() - started}ms: "${(result?.transcript || '').slice(0, 60)}"`);
      return result;
    } catch (err: any) {
      this.logger.error(`[transcribe-json] failed in ${Date.now() - started}ms: ${err?.message}`);
      throw err;
    }
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiOperation({ summary: 'Transcribe audio to text (Chinese + English auto-detect)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: { type: 'string', format: 'binary' },
        lang: { type: 'string', description: 'Language hint: "zh" or "en". Omit for auto-detect.' },
      },
    },
  })
  async transcribe(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Query('lang') lang?: string,
  ) {
    this.logger.log(
      `[transcribe] request received: file=${file ? `${file.originalname} ${file.mimetype} ${file.size}B` : 'NONE'} lang=${lang || 'auto'}`,
    );
    if (!file) {
      throw new BadRequestException('No audio file provided. Use field name "audio".');
    }
    const userId = req?.user?.id || req?.user?.sub;
    const hasCustom = userId ? await this.userHasCustomProvider(userId) : false;
    const started = Date.now();
    try {
      const result = await this.voiceService.transcribe(file.buffer, file.mimetype, file.originalname, lang, { useGeminiSTT: !hasCustom });
      this.logger.log(`[transcribe] done in ${Date.now() - started}ms: "${(result?.transcript || '').slice(0, 60)}"`);
      return result;
    } catch (err: any) {
      this.logger.error(`[transcribe] failed in ${Date.now() - started}ms: ${err?.message}`);
      throw err;
    }
  }

  /** Convert raw PCM to WAV with proper header */
  private pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
  }
}
