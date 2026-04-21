import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { HfVideoGenerationProvider, resolveHfVideoModel } from '../video-generation/hf-video-generation.provider';
import { PollyTtsProvider } from './polly-tts.provider';
import {
  runFfmpeg,
  probeDuration,
  writeSrt,
  ensureDir,
  ffEscapePath,
} from './ffmpeg-runner';

export interface ComposerScene {
  /** Visual prompt sent to the video model. */
  visualPrompt: string;
  /** Narration spoken over this scene; also burned as subtitle. */
  narration?: string;
  /** Desired duration in seconds (clip will be looped/cut to match). */
  durationSec?: number;
  /** Optional subtitle override if different from narration. */
  subtitle?: string;
}

export interface ComposeVideoParams {
  title?: string;
  scenes: ComposerScene[];
  /** 'hf-ltx' (default, fast) | 'hf-cogvideox' (higher quality, slower) */
  model?: string;
  /** Voice id for Polly; defaults based on language. */
  voice?: string;
  language?: 'zh' | 'en';
  /** BGM url to overlay under narration (optional). */
  bgmUrl?: string;
  /** Output aspect ratio. Default 9:16 for social. */
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** Subtitle font size in pixels. */
  subtitleFontSize?: number;
  /** Crossfade duration between scenes in seconds. */
  transitionSec?: number;
  /** Whether to burn subtitles (default true). */
  burnSubtitles?: boolean;
}

export interface ComposeVideoJob {
  jobId: string;
  userId: string;
  title: string;
  status: 'queued' | 'generating_scenes' | 'synthesizing_tts' | 'composing' | 'completed' | 'failed';
  totalScenes: number;
  scenesDone: number;
  createdAt: number;
  updatedAt: number;
  outputUrl?: string;
  error?: string;
  /** Per-scene HF request ids while generating. */
  sceneRequestIds?: string[];
  /** Per-scene local video paths once scenes finish. */
  sceneLocalPaths?: string[];
  logs: string[];
  params: ComposeVideoParams;
}

const DEFAULT_SCENE_DURATION_SEC = 5;
const DEFAULT_TRANSITION_SEC = 0.5;
const DEFAULT_SUBTITLE_FONT_SIZE = 28;
// Poll HF every 5s; scenes usually take 30-120s.
const SCENE_POLL_INTERVAL_MS = 5000;
const SCENE_MAX_WAIT_MS = 10 * 60 * 1000; // 10 min per scene

/**
 * Agentrix Video Composer — mirrors the "openclaw montage" capability by
 * combining HF free video generation with AWS Polly TTS and ffmpeg.
 *
 * Pipeline per job:
 *   1. For each scene, call HF (LTX-Video/CogVideoX) with visualPrompt → mp4
 *   2. For each scene with narration, call Polly → mp3
 *   3. ffmpeg: trim/loop scenes to target duration
 *   4. ffmpeg: mux narration + optional BGM (duck BGM under voice)
 *   5. ffmpeg: burn-in subtitles (.srt)
 *   6. ffmpeg: xfade transitions between consecutive scenes
 *   7. Concat → final mp4 at backend/uploads/video-composer/<jobId>.mp4
 */
@Injectable()
export class VideoComposerService {
  private readonly logger = new Logger(VideoComposerService.name);
  private readonly jobs = new Map<string, ComposeVideoJob>();

  constructor(
    private readonly configService: ConfigService,
    private readonly hfProvider: HfVideoGenerationProvider,
    private readonly pollyProvider: PollyTtsProvider,
  ) {}

  listJobs(userId: string): ComposeVideoJob[] {
    return Array.from(this.jobs.values()).filter((j) => j.userId === userId);
  }

  getJob(userId: string, jobId: string): ComposeVideoJob | null {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) return null;
    return job;
  }

  startJob(userId: string, params: ComposeVideoParams): ComposeVideoJob {
    if (!params || !Array.isArray(params.scenes) || params.scenes.length === 0) {
      throw new Error('compose_video requires at least one scene in params.scenes[]');
    }
    if (params.scenes.length > 12) {
      throw new Error('compose_video currently supports at most 12 scenes per job (keep total duration under ~2 minutes).');
    }
    const jobId = `compose-${randomUUID()}`;
    const job: ComposeVideoJob = {
      jobId,
      userId,
      title: params.title?.trim() || this.inferTitle(params),
      status: 'queued',
      totalScenes: params.scenes.length,
      scenesDone: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sceneRequestIds: [],
      sceneLocalPaths: [],
      logs: [],
      params,
    };
    this.jobs.set(jobId, job);
    this.appendLog(job, `Queued. Scenes=${job.totalScenes}.`);
    // Fire-and-forget. Errors caught inside runJob.
    void this.runJob(job);
    return job;
  }

  // -------------- internal pipeline --------------

  private async runJob(job: ComposeVideoJob): Promise<void> {
    try {
      const apiKey = this.resolveHfApiKey();
      if (!apiKey) {
        throw new Error('HuggingFace video provider is not configured. Set HF_TOKEN on the server.');
      }
      const workDir = await this.prepareWorkDir(job.jobId);

      job.status = 'generating_scenes';
      job.updatedAt = Date.now();
      const modelRef = resolveHfVideoModel(job.params.model);
      this.appendLog(job, `Using HF model ${modelRef.path} for scene generation.`);

      // 1. Kick off all scene HF calls in parallel and collect binaries.
      const sceneBuffers: Buffer[] = [];
      for (let i = 0; i < job.params.scenes.length; i++) {
        const scene = job.params.scenes[i];
        this.appendLog(job, `Scene ${i + 1}/${job.totalScenes}: submitting to HF.`);
        const submission = this.hfProvider.submit(apiKey, modelRef.path, scene.visualPrompt);
        job.sceneRequestIds!.push(submission.request_id);
        const buf = await this.awaitSceneResult(submission.request_id);
        sceneBuffers.push(buf);
        job.scenesDone = i + 1;
        job.updatedAt = Date.now();
        this.appendLog(job, `Scene ${i + 1}/${job.totalScenes}: HF returned ${buf.length} bytes.`);
      }

      // Persist raw scene MP4s to work dir.
      const rawScenePaths: string[] = [];
      for (let i = 0; i < sceneBuffers.length; i++) {
        const p = path.join(workDir, `scene-${i}-raw.mp4`);
        await fs.promises.writeFile(p, sceneBuffers[i]);
        rawScenePaths.push(p);
      }
      job.sceneLocalPaths = rawScenePaths;

      // 2. Synthesize Polly narration per scene (if any narration text).
      job.status = 'synthesizing_tts';
      job.updatedAt = Date.now();
      const narrationPaths: (string | null)[] = [];
      for (let i = 0; i < job.params.scenes.length; i++) {
        const scene = job.params.scenes[i];
        if (!scene.narration || !scene.narration.trim()) {
          narrationPaths.push(null);
          continue;
        }
        this.appendLog(job, `Scene ${i + 1}: TTS ${scene.narration.length} chars.`);
        const audio = await this.pollyProvider.synthesize({
          text: scene.narration,
          voiceId: job.params.voice,
          language: job.params.language,
        });
        const audioPath = path.join(workDir, `scene-${i}-narr.mp3`);
        await fs.promises.writeFile(audioPath, audio);
        narrationPaths.push(audioPath);
      }

      // 3. Compose per-scene clip: trim/loop video to target duration, mux narration, burn subtitle.
      job.status = 'composing';
      job.updatedAt = Date.now();
      const composedPaths: string[] = [];
      const targetAspect = job.params.aspectRatio || '9:16';
      const burnSubs = job.params.burnSubtitles !== false;
      const subtitleFont = job.params.subtitleFontSize || DEFAULT_SUBTITLE_FONT_SIZE;

      for (let i = 0; i < rawScenePaths.length; i++) {
        const scene = job.params.scenes[i];
        const rawPath = rawScenePaths[i];
        const narrPath = narrationPaths[i];
        const duration = this.resolveSceneDuration(scene, narrPath);
        const composedPath = path.join(workDir, `scene-${i}-composed.mp4`);
        await this.composeScene({
          rawVideoPath: rawPath,
          narrationPath: narrPath,
          subtitleText: burnSubs ? (scene.subtitle || scene.narration || '') : '',
          durationSec: duration,
          aspectRatio: targetAspect,
          subtitleFontSize: subtitleFont,
          outputPath: composedPath,
          workDir,
          sceneIndex: i,
        });
        composedPaths.push(composedPath);
        this.appendLog(job, `Scene ${i + 1}: composed (${duration.toFixed(1)}s).`);
      }

      // 4. Concatenate all scenes with crossfade transitions.
      const transitionSec = job.params.transitionSec ?? DEFAULT_TRANSITION_SEC;
      const concatOutput = path.join(workDir, `concat.mp4`);
      if (composedPaths.length === 1) {
        await fs.promises.copyFile(composedPaths[0], concatOutput);
      } else {
        await this.concatWithCrossfade(composedPaths, transitionSec, concatOutput);
      }
      this.appendLog(job, `Concat done (${composedPaths.length} scenes, ${transitionSec}s transitions).`);

      // 5. Optional BGM overlay — duck BGM under existing audio track.
      const finalOutput = await this.finalizeWithBgm(job, concatOutput, workDir);

      // 6. Publish to /api/uploads/video-composer/
      const publishedUrl = await this.publishResult(job, finalOutput);
      job.outputUrl = publishedUrl;
      job.status = 'completed';
      job.updatedAt = Date.now();
      this.appendLog(job, `Completed. Output: ${publishedUrl}`);
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || String(err);
      job.updatedAt = Date.now();
      this.logger.warn(`Compose job ${job.jobId} failed: ${job.error}`);
      this.appendLog(job, `Failed: ${job.error}`);
    }
  }

  private resolveSceneDuration(scene: ComposerScene, narrationPath: string | null): number {
    if (scene.durationSec && scene.durationSec > 0) {
      return Math.min(30, scene.durationSec);
    }
    return DEFAULT_SCENE_DURATION_SEC;
  }

  private async composeScene(args: {
    rawVideoPath: string;
    narrationPath: string | null;
    subtitleText: string;
    durationSec: number;
    aspectRatio: '16:9' | '9:16' | '1:1';
    subtitleFontSize: number;
    outputPath: string;
    workDir: string;
    sceneIndex: number;
  }): Promise<void> {
    const { rawVideoPath, narrationPath, subtitleText, durationSec, aspectRatio, subtitleFontSize, outputPath, workDir, sceneIndex } = args;
    const resolution = aspectRatio === '16:9' ? '1280x720' : aspectRatio === '1:1' ? '720x720' : '720x1280';
    const [w, h] = resolution.split('x').map(Number);

    // Build filter chain: scale/pad to target, trim/loop to duration, optionally burn subtitles.
    const filters: string[] = [];
    filters.push(`[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[scaled]`);
    filters.push(`[scaled]tpad=stop_mode=clone:stop_duration=${durationSec.toFixed(2)},trim=duration=${durationSec.toFixed(2)},setpts=PTS-STARTPTS[framed]`);

    let videoLabel = 'framed';
    if (subtitleText && subtitleText.trim()) {
      const srtPath = path.join(workDir, `scene-${sceneIndex}.srt`);
      await writeSrt(srtPath, subtitleText, durationSec);
      const escaped = ffEscapePath(srtPath);
      filters.push(
        `[framed]subtitles='${escaped}':force_style='FontSize=${subtitleFontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,Outline=2,MarginV=40,Alignment=2'[subbed]`
      );
      videoLabel = 'subbed';
    }

    // Audio: if narration, use it at full volume silent-padded to duration; else silent track.
    const ffArgs: string[] = ['-y', '-i', rawVideoPath];
    if (narrationPath) {
      ffArgs.push('-i', narrationPath);
    }
    ffArgs.push('-filter_complex');
    if (narrationPath) {
      // Pad/trim narration to scene duration.
      filters.push(`[1:a]apad=whole_dur=${durationSec.toFixed(2)},atrim=duration=${durationSec.toFixed(2)},asetpts=PTS-STARTPTS[narr]`);
      ffArgs.push(filters.join(';'));
      ffArgs.push('-map', `[${videoLabel}]`, '-map', '[narr]');
    } else {
      ffArgs.push(filters.join(';'));
      ffArgs.push('-map', `[${videoLabel}]`);
      ffArgs.push('-f', 'lavfi', '-t', durationSec.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
      ffArgs.push('-map', '2:a');
    }
    ffArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
    ffArgs.push('-c:a', 'aac', '-b:a', '128k');
    ffArgs.push('-pix_fmt', 'yuv420p');
    ffArgs.push('-r', '24');
    ffArgs.push(outputPath);
    await runFfmpeg(ffArgs);
  }

  private async concatWithCrossfade(scenePaths: string[], transitionSec: number, outputPath: string): Promise<void> {
    if (scenePaths.length < 2) {
      throw new Error('concatWithCrossfade requires >= 2 scenes');
    }
    // Gather durations.
    const durations: number[] = [];
    for (const p of scenePaths) {
      durations.push(await probeDuration(p));
    }
    const args: string[] = ['-y'];
    for (const p of scenePaths) {
      args.push('-i', p);
    }
    // Build xfade chain and audio crossfade chain.
    const vParts: string[] = [];
    const aParts: string[] = [];
    let prevV = '0:v';
    let prevA = '0:a';
    let cumOffset = 0;
    for (let i = 1; i < scenePaths.length; i++) {
      cumOffset += durations[i - 1] - transitionSec;
      const vOut = i === scenePaths.length - 1 ? 'vOut' : `v${i}`;
      const aOut = i === scenePaths.length - 1 ? 'aOut' : `a${i}`;
      vParts.push(`[${prevV}][${i}:v]xfade=transition=fade:duration=${transitionSec}:offset=${cumOffset.toFixed(2)}[${vOut}]`);
      aParts.push(`[${prevA}][${i}:a]acrossfade=d=${transitionSec}[${aOut}]`);
      prevV = vOut;
      prevA = aOut;
    }
    args.push('-filter_complex', [...vParts, ...aParts].join(';'));
    args.push('-map', '[vOut]', '-map', '[aOut]');
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
    args.push('-c:a', 'aac', '-b:a', '128k');
    args.push('-pix_fmt', 'yuv420p');
    args.push(outputPath);
    await runFfmpeg(args);
  }

  private async finalizeWithBgm(job: ComposeVideoJob, concatPath: string, workDir: string): Promise<string> {
    const bgmUrl = job.params.bgmUrl;
    if (!bgmUrl) {
      return concatPath;
    }
    // Download BGM to work dir.
    const bgmPath = path.join(workDir, 'bgm.mp3');
    try {
      const res = await fetch(bgmUrl);
      if (!res.ok) throw new Error(`BGM fetch ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.promises.writeFile(bgmPath, buf);
    } catch (err: any) {
      this.appendLog(job, `BGM skipped (fetch failed: ${err.message}).`);
      return concatPath;
    }
    // Duck BGM under the existing narration track via sidechaincompress.
    const finalPath = path.join(workDir, 'final.mp4');
    const totalDuration = await probeDuration(concatPath);
    const args: string[] = [
      '-y',
      '-i', concatPath,
      '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex',
      `[1:a]volume=0.18,aloop=loop=-1:size=2e9[bgm0];[bgm0]atrim=duration=${totalDuration.toFixed(2)}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-shortest',
      finalPath,
    ];
    await runFfmpeg(args);
    this.appendLog(job, `BGM mixed at 18% volume.`);
    return finalPath;
  }

  private async publishResult(job: ComposeVideoJob, localPath: string): Promise<string> {
    const publishDir = path.join(process.cwd(), 'uploads', 'video-composer');
    await ensureDir(publishDir);
    const filename = `${job.jobId}.mp4`;
    const publishPath = path.join(publishDir, filename);
    await fs.promises.copyFile(localPath, publishPath);
    const base = (this.configService.get<string>('APP_URL') || this.configService.get<string>('PUBLIC_API_BASE') || 'https://agentrix.top').replace(/\/$/, '');
    return `${base}/api/uploads/video-composer/${filename}`;
  }

  private async awaitSceneResult(requestId: string): Promise<Buffer> {
    const start = Date.now();
    while (true) {
      const snapshot = this.hfProvider.getStatus(requestId);
      if (snapshot.status === 'COMPLETED') {
        // Drain buffer via saveResult to a scratch path.
        const tmpDir = HfVideoGenerationProvider.getTempDir();
        await ensureDir(tmpDir);
        const { localPath } = await this.hfProvider.saveResult(requestId, tmpDir, 'http://unused.local');
        const buf = await fs.promises.readFile(localPath);
        await fs.promises.unlink(localPath).catch(() => {});
        return buf;
      }
      if (snapshot.status === 'FAILED') {
        throw new Error(`Scene generation failed: ${snapshot.error || 'unknown'}`);
      }
      if (Date.now() - start > SCENE_MAX_WAIT_MS) {
        throw new Error(`Scene generation exceeded ${SCENE_MAX_WAIT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, SCENE_POLL_INTERVAL_MS));
    }
  }

  private async prepareWorkDir(jobId: string): Promise<string> {
    const dir = path.join(HfVideoGenerationProvider.getTempDir(), jobId);
    await ensureDir(dir);
    return dir;
  }

  private resolveHfApiKey(): string | null {
    return this.configService.get<string>('HF_TOKEN')
      || this.configService.get<string>('HUGGINGFACE_TOKEN')
      || this.configService.get<string>('HUGGINGFACE_API_KEY')
      || null;
  }

  private inferTitle(params: ComposeVideoParams): string {
    const first = params.scenes[0]?.visualPrompt || 'Agentrix Video';
    const clean = first.replace(/\s+/g, ' ').trim();
    return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
  }

  private appendLog(job: ComposeVideoJob, msg: string): void {
    const stamp = new Date().toISOString();
    const entry = `[${stamp}] ${msg}`;
    job.logs.push(entry);
    if (job.logs.length > 200) {
      job.logs.splice(0, job.logs.length - 200);
    }
    this.logger.log(`compose ${job.jobId}: ${msg}`);
  }
}
