import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { Platform } from '../types';
import { elapsedSeconds } from './time.utils';

const execFileAsync = promisify(execFile);
const ROOT_YTDLP = path.resolve(__dirname, '..', '..', '..', 'bin', 'yt-dlp');

export interface VideoMetadata {
  title: string | null;
  duration: number | null;
}

@Injectable()
export class YtdlpService {
  private readonly logger = new Logger(YtdlpService.name);

  private get binary(): string {
    if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
    if (existsSync(ROOT_YTDLP)) return ROOT_YTDLP;
    return 'yt-dlp';
  }

  private cookieArgs(platform: Platform): string[] {
    const browser = process.env.IG_COOKIES_BROWSER;
    return platform === 'instagram' && browser ? ['--cookies-from-browser', browser] : [];
  }

  private async run(args: string[], platform: Platform): Promise<string> {
    // YouTube extraction needs a JS runtime for player challenges; Node is on this machine.
    const fullArgs = [...args, '--js-runtimes', 'node', ...this.cookieArgs(platform)];
    this.logger.log(`exec: yt-dlp ${fullArgs.join(' ')}`);
    const startedAt = Date.now();
    try {
      const { stdout } = await execFileAsync(this.binary, fullArgs, {
        maxBuffer: 64 * 1024 * 1024,
        // Kill a hung yt-dlp (e.g. Instagram stuck on a login wall) instead of
        // letting the job spin forever.
        timeout: Number(process.env.YTDLP_TIMEOUT_MS) || 240000,
      });
      this.logger.log(`yt-dlp done in ${elapsedSeconds(startedAt)}`);
      return stdout;
    } catch (err) {
      const { stdout = '', stderr = '' } = err as { stdout?: string; stderr?: string };
      this.logger.error(
        `yt-dlp failed after ${elapsedSeconds(startedAt)} (${fullArgs.join(' ')}): ${stderr || String(err)}`,
      );
      throw Object.assign(new Error('yt-dlp failed'), { stdout, stderr });
    }
  }

  async getMetadata(url: string, platform: Platform): Promise<VideoMetadata> {
    const stdout = await this.run(['-J', '--no-warnings', url], platform);
    const info = JSON.parse(stdout) as { title?: string; duration?: number };
    return { title: info.title ?? null, duration: info.duration ?? null };
  }

  // Single network round-trip: prints {title, duration} on stdout AND writes the
  // caption file — a yt-dlp call against YouTube costs ~30s, so one call, not two.
  // Exact languages only: a wildcard like "en.*" matches dozens of auto-translated
  // variants (en-de, en-fr, …) and gets the caption endpoint rate-limited (429).
  async fetchYoutubeCaptions(url: string, tmpDir: string, platform: Platform): Promise<VideoMetadata> {
    const args = [
      '--no-simulate',
      '--print',
      '%(.{title,duration})j',
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs',
      'en,en-orig,en-US,en-GB,-live_chat',
      '--sub-format',
      'json3',
      '-P',
      tmpDir,
      '-o',
      'sub',
      url,
    ];
    let stdout: string;
    try {
      stdout = await this.run(args, platform);
    } catch (err) {
      // A non-zero exit can still have printed metadata and saved a caption file
      // (e.g. one of several caption tracks 429'd). Salvage what we got.
      const meta = this.parsePrintedMetadata((err as { stdout?: string }).stdout ?? '');
      if (!meta) throw err;
      return meta;
    }
    return this.parsePrintedMetadata(stdout) ?? { title: null, duration: null };
  }

  private parsePrintedMetadata(stdout: string): VideoMetadata | null {
    try {
      const info = JSON.parse(stdout.trim().split('\n')[0]) as { title?: string; duration?: number };
      return { title: info.title ?? null, duration: info.duration ?? null };
    } catch {
      return null;
    }
  }

  async downloadAudio(url: string, tmpDir: string, ffmpegDir: string, platform: Platform): Promise<void> {
    await this.run(
      [
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '7',
        '--ffmpeg-location',
        ffmpegDir,
        '-P',
        tmpDir,
        '-o',
        'audio.%(ext)s',
        url,
      ],
      platform,
    );
  }
}
