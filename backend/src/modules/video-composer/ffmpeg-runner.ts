import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger('FfmpegRunner');

/**
 * Execute an ffmpeg command and resolve with stderr output (ffmpeg writes
 * progress to stderr by convention). Rejects on non-zero exit.
 */
export function runFfmpeg(args: string[], opts?: { timeoutMs?: number; cwd?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000;
    const binary = process.env.FFMPEG_PATH || 'ffmpeg';
    logger.log(`ffmpeg ${args.join(' ')}`);
    const child = spawn(binary, args, { cwd: opts?.cwd });
    let stderrBuf = '';
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });
    const killTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(new Error(`ffmpeg spawn failed: ${err.message} (is ffmpeg installed and on PATH?)`));
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve(stderrBuf);
      } else {
        reject(new Error(`ffmpeg exited ${code}. Last stderr:\n${stderrBuf.slice(-1500)}`));
      }
    });
  });
}

/** Probe an input file duration in seconds (float), via ffprobe. */
export async function probeDuration(file: string): Promise<number> {
  const binary = process.env.FFPROBE_PATH || 'ffprobe';
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => { out += b.toString(); });
    child.stderr.on('data', (b) => { err += b.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited ${code}: ${err}`));
      }
      const n = Number(out.trim());
      if (!Number.isFinite(n) || n <= 0) {
        return reject(new Error(`ffprobe returned invalid duration: "${out}"`));
      }
      resolve(n);
    });
  });
}

/** Write a UTF-8 SRT subtitle file for a single line of narration. */
export async function writeSrt(srtPath: string, text: string, durationSec: number): Promise<void> {
  const end = Math.max(0.5, durationSec);
  const endHh = Math.floor(end / 3600).toString().padStart(2, '0');
  const endMm = Math.floor((end % 3600) / 60).toString().padStart(2, '0');
  const endSs = Math.floor(end % 60).toString().padStart(2, '0');
  const endMs = Math.floor((end - Math.floor(end)) * 1000).toString().padStart(3, '0');
  const body = `1\n00:00:00,000 --> ${endHh}:${endMm}:${endSs},${endMs}\n${text.replace(/\r?\n/g, ' ').trim()}\n`;
  await fs.promises.writeFile(srtPath, body, 'utf8');
}

/**
 * Ensure working directory exists.
 */
export async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

/** Quote a path for ffmpeg filter arg (escape special chars). */
export function ffEscapePath(p: string): string {
  // ffmpeg subtitles filter needs colons/backslashes escaped.
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export { path as pathUtil };
