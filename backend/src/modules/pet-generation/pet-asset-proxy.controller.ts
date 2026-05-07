import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

/**
 * PetAssetProxyController — same-origin proxy for 3D model assets.
 *
 * Why this exists:
 *   The PetCreator pipeline returns CDN URLs from third-party providers
 *   (Tencent Hunyuan3D, Meshy, etc.). Browsers cannot fetch these from
 *   the Tauri / web shell because the upstream CDNs do not send
 *   `Access-Control-Allow-Origin: *`, so `three.js` GLTFLoader fails with
 *   a CORS error and the user sees "VRM load failed".
 *
 *   This endpoint streams the upstream bytes back from the same origin
 *   that serves the JS bundle, with permissive CORS headers, so the
 *   loader succeeds.
 *
 * Security:
 *   - Hardcoded host allowlist below — only known model CDNs may be
 *     proxied. Any other host returns 400. This avoids SSRF + the proxy
 *     being abused as an open relay.
 *   - URL must be http/https with a valid hostname.
 *   - No auth required: the upstream URL is itself unguessable (provider
 *     job ids embedded), and we never log the full URL.
 */

const ALLOWED_HOST_SUFFIXES: readonly string[] = [
  // Tencent Cloud (Hunyuan3D outputs)
  '.tencentcos.cn',
  '.myqcloud.com',
  '.tencent-cloud.com',
  '.qcloud.com',
  // Meshy.ai outputs
  '.meshy.ai',
  'meshy.ai',
  '.assets.meshy.ai',
  // Common AWS S3 buckets used by Meshy / Hunyuan3D mirrors
  '.amazonaws.com',
  // HuggingFace inference endpoint outputs (VRM auto-rig)
  '.huggingface.co',
  'huggingface.co',
  // Generic CDN sometimes used (Cloudflare R2)
  '.r2.cloudflarestorage.com',
  '.r2.dev',
];

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) =>
    suffix.startsWith('.') ? h.endsWith(suffix) : h === suffix,
  );
}

function guessContentType(url: string, upstream: string | null): string {
  if (upstream && upstream !== 'application/octet-stream') return upstream;
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.vrm')) return 'model/vrm';
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  if (lower.endsWith('.gltf')) return 'model/gltf+json';
  if (lower.endsWith('.fbx')) return 'application/octet-stream';
  if (lower.endsWith('.obj')) return 'text/plain';
  if (lower.endsWith('.usdz')) return 'model/vnd.usdz+zip';
  return upstream || 'application/octet-stream';
}

@ApiTags('pet-generation')
@Controller('pet-generation')
export class PetAssetProxyController {
  private readonly logger = new Logger('PetAssetProxy');

  @Get('asset')
  @ApiOperation({
    summary:
      'Proxy a third-party 3D model URL with permissive CORS so the desktop / web shell can render it via three.js. Allowlisted upstream hosts only.',
  })
  async proxy(@Query('u') u: string, @Res() res: Response): Promise<void> {
    if (!u || typeof u !== 'string') {
      throw new BadRequestException('Missing query parameter u');
    }

    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Only http/https URLs may be proxied');
    }
    if (!isAllowedHost(parsed.hostname)) {
      throw new BadRequestException(
        `Host not in proxy allowlist: ${parsed.hostname}`,
      );
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'AgentrixPetAssetProxy/1.0' },
      });
    } catch (err: any) {
      this.logger.warn(
        `proxy fetch failed for host=${parsed.hostname}: ${err?.message || err}`,
      );
      res.status(502).json({
        success: false,
        code: 'BadGateway',
        message: 'Upstream fetch failed',
      });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      res
        .status(upstream.status || 502)
        .json({
          success: false,
          code: 'UpstreamError',
          message: `Upstream returned ${upstream.status}`,
        });
      return;
    }

    const ct = guessContentType(parsed.pathname, upstream.headers.get('content-type'));
    const cl = upstream.headers.get('content-length');

    res.setHeader('Content-Type', ct);
    if (cl) res.setHeader('Content-Length', cl);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Proxy-Source', parsed.hostname);
    res.status(200);

    // Node 18+ fetch returns a web ReadableStream. Pipe to express response.
    const reader = (upstream.body as any).getReader
      ? (upstream.body as any).getReader()
      : null;
    if (reader) {
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
        res.end();
      } catch (err: any) {
        this.logger.warn(`proxy stream error: ${err?.message || err}`);
        try {
          res.end();
        } catch {
          /* noop */
        }
      }
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    }
  }
}
