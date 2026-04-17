import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Phase 5.c — OuteTTS relay.
 *
 * Mobile / desktop clients may point at a self-hosted OuteTTS server
 * (llama-tts + OuteTTS-1.0-0.6B or OuteTTS-0.2/0.3 endpoints). For corporate
 * networks where the client can't reach the user's LAN server directly, we
 * accept the synthesis request on the backend and forward it — streaming the
 * audio bytes back as `audio/wav` (OuteTTS default).
 *
 * Config (env, optional — falls back to request body):
 *   - OUTETTS_DEFAULT_URL   e.g. http://voice.example.lan:8000/tts
 *   - OUTETTS_DEFAULT_VOICE e.g. en_female_01
 *   - OUTETTS_TIMEOUT_MS    default 30000
 *   - OUTETTS_MAX_CHARS     default 4000
 *
 * Security:
 *   - JWT-authenticated only (no public relay).
 *   - When `serverUrl` is client-supplied, it MUST match an http/https URL
 *     and we block localhost / RFC1918 ranges to prevent SSRF unless the
 *     env-configured `OUTETTS_ALLOW_PRIVATE=true` is set (opt-in for LAN ops).
 */
@ApiTags('Voice')
@Controller('voice/outetts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OuteTTSRelayController {
  private readonly logger = new Logger(OuteTTSRelayController.name);

  private readonly defaultUrl = process.env.OUTETTS_DEFAULT_URL || '';
  private readonly defaultVoice = process.env.OUTETTS_DEFAULT_VOICE || 'en_female_01';
  private readonly timeoutMs = Number(process.env.OUTETTS_TIMEOUT_MS || 30000);
  private readonly maxChars = Number(process.env.OUTETTS_MAX_CHARS || 4000);
  private readonly allowPrivate = String(process.env.OUTETTS_ALLOW_PRIVATE || 'false').toLowerCase() === 'true';

  @Post('synthesize')
  @ApiOperation({ summary: 'Relay TTS request to a self-hosted OuteTTS server' })
  async synthesize(
    @Body() body: {
      text?: string;
      voice?: string;
      serverUrl?: string;
      sampleRate?: number;
      format?: 'wav' | 'mp3' | 'pcm';
    },
    @Res() res: Response,
  ): Promise<void> {
    const text = (body?.text || '').trim();
    if (!text) {
      throw new BadRequestException('text is required');
    }
    if (text.length > this.maxChars) {
      throw new BadRequestException(`text exceeds OUTETTS_MAX_CHARS (${this.maxChars})`);
    }

    const serverUrl = body?.serverUrl || this.defaultUrl;
    if (!serverUrl) {
      throw new ServiceUnavailableException(
        'OuteTTS server URL not configured. Set OUTETTS_DEFAULT_URL or pass serverUrl.',
      );
    }
    if (!this.isAllowedUrl(serverUrl)) {
      throw new BadRequestException('serverUrl rejected (SSRF guard — enable OUTETTS_ALLOW_PRIVATE for LAN)');
    }

    const voice = body?.voice || this.defaultVoice;
    const format = body?.format || 'wav';
    const sampleRate = body?.sampleRate || 22050;

    const payload = { text, voice, sample_rate: sampleRate, format };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const upstream = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!upstream.ok) {
        const errorText = await upstream.text().catch(() => '');
        this.logger.warn(`OuteTTS upstream ${upstream.status}: ${errorText.slice(0, 200)}`);
        res.status(502).json({
          message: `OuteTTS upstream returned ${upstream.status}`,
          upstreamStatus: upstream.status,
        });
        return;
      }

      const contentType = upstream.headers.get('content-type')
        || (format === 'mp3' ? 'audio/mpeg' : format === 'pcm' ? 'application/octet-stream' : 'audio/wav');
      res.set({
        'Content-Type': contentType,
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-store',
      });

      if (!upstream.body) {
        res.end();
        return;
      }

      // Stream the response through as it arrives so time-to-first-audio stays low.
      const reader = (upstream.body as any).getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
      } finally {
        try { reader.releaseLock?.(); } catch { /* ignore */ }
      }
      res.end();
    } catch (err: any) {
      clearTimeout(timer);
      const isAbort = err?.name === 'AbortError';
      this.logger.warn(`OuteTTS relay failed${isAbort ? ' (timeout)' : ''}: ${err?.message}`);
      if (!res.headersSent) {
        res
          .status(isAbort ? 504 : 502)
          .json({ message: isAbort ? 'OuteTTS upstream timed out' : `OuteTTS relay error: ${err?.message}` });
      } else {
        res.end();
      }
    }
  }

  private isAllowedUrl(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    if (this.allowPrivate) return true;

    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    // Block IPv4 private ranges when strict.
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
      const a = Number(ipv4[1]);
      const b = Number(ipv4[2]);
      if (a === 10) return false;
      if (a === 127) return false;
      if (a === 169 && b === 254) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
    }
    return true;
  }
}
