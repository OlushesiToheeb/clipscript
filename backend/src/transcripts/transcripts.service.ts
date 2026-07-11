import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Op } from 'sequelize';
import { Platform } from '../types';
import { parseJson3Captions } from './captions.utils';
import { tokenFor, idFromToken } from './token.utils';
import { Transcript } from './transcript.model';
import { TranscriptionService } from './transcription.service';
import { elapsedSeconds } from './time.utils';
import { detectPlatform, normalizeUrl } from './url.utils';
import { YtdlpService } from './ytdlp.service';

const NO_KEY_ERROR =
  'This video has no captions — transcribing its audio needs an OpenAI API key. Set OPENAI_API_KEY in backend/.env and retry.';

// A transcript of a public video is public content, so caching it (keyed by URL)
// helps everyone and leaks nothing. A private Instagram reel is not public, so it
// is never served from the shared cache — each request re-processes it, and its
// row is only reachable with its own unguessable token.
const CACHEABLE: Platform[] = ['youtube', 'tiktok'];

export interface PublicTranscript {
  token: string;
  url: string;
  platform: Platform;
  title: string | null;
  status: Transcript['status'];
  source: Transcript['source'];
  text: string | null;
  error: string | null;
  durationSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const INTERRUPTED_ERROR =
  'Transcribing was interrupted (the server restarted). Please paste the link again.';

@Injectable()
export class TranscriptsService implements OnModuleInit {
  private readonly logger = new Logger(TranscriptsService.name);

  constructor(
    @InjectModel(Transcript) private readonly transcriptModel: typeof Transcript,
    private readonly ytdlp: YtdlpService,
    private readonly transcription: TranscriptionService,
  ) {}

  // Processing runs in-memory and detached, so a row left as 'processing' after
  // a restart is orphaned — its work is gone and nothing will ever finish it.
  // Fail those rows on boot so they stop spinning and can be retried.
  async onModuleInit(): Promise<void> {
    const [count] = await this.transcriptModel.update(
      { status: 'failed', error: INTERRUPTED_ERROR },
      { where: { status: 'processing' } },
    );
    if (count > 0) {
      this.logger.warn(`Recovered ${count} interrupted transcript(s) left in 'processing' on startup.`);
    }
  }

  async create(rawUrl: string): Promise<{ transcript: Transcript; created: boolean }> {
    const platform = detectPlatform(rawUrl);
    const url = normalizeUrl(rawUrl);
    if (!platform || !url) {
      throw new BadRequestException('Not a recognizable YouTube, TikTok or Instagram video URL.');
    }

    if (CACHEABLE.includes(platform)) {
      const existing = await this.transcriptModel.findOne({
        where: { url, status: { [Op.in]: ['completed', 'processing'] } },
        order: [['id', 'DESC']],
      });
      if (existing) {
        this.logger.log(`#${existing.id} cache hit (${existing.status}) — reusing for ${url}`);
        return { transcript: existing, created: false };
      }
    }

    const transcript = await this.transcriptModel.create({ url, platform, status: 'processing' });
    this.logger.log(`#${transcript.id} created (${platform}) — ${url}`);
    this.process(transcript).catch((err) => this.logger.error(`Unhandled processing error: ${err}`));
    return { transcript, created: true };
  }

  async findByToken(token: string): Promise<Transcript> {
    const id = idFromToken(token);
    const transcript = id ? await this.transcriptModel.findByPk(id) : null;
    if (!transcript) throw new NotFoundException('Transcript not found');
    return transcript;
  }

  // The public shape — a signed token instead of the raw id, and no internal
  // columns. This is the only representation that leaves the server.
  toPublic(t: Transcript): PublicTranscript {
    return {
      token: tokenFor(t.id),
      url: t.url,
      platform: t.platform,
      title: t.title,
      status: t.status,
      source: t.source,
      text: t.text,
      error: t.error,
      durationSeconds: t.durationSeconds,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private async process(transcript: Transcript): Promise<void> {
    const startedAt = Date.now();
    const step = (message: string) => this.logger.log(`#${transcript.id} ${message}`);
    let tmpDir: string | null = null;
    try {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipscript-'));
      const dir = tmpDir;
      step(
        transcript.platform === 'youtube'
          ? 'step 1: fetching metadata + caption tracks (single yt-dlp call)'
          : 'step 1: fetching metadata via yt-dlp',
      );
      const meta = await this.withFriendlyError(transcript, () =>
        transcript.platform === 'youtube'
          ? this.ytdlp.fetchYoutubeCaptions(transcript.url, dir, transcript.platform)
          : this.ytdlp.getMetadata(transcript.url, transcript.platform),
      );
      step(`metadata: "${meta.title ?? 'untitled'}" · ${meta.duration ?? '?'}s video`);
      await transcript.update({ title: meta.title, durationSeconds: meta.duration });

      if (transcript.platform === 'youtube') {
        const text = await this.readCaptions(dir, step);
        if (text) {
          await transcript.update({ text, source: 'captions', status: 'completed' });
          step(`completed via captions in ${elapsedSeconds(startedAt)} — ${wordCount(text)} words`);
          return;
        }
        step('no caption track found — falling back to audio transcription');
      }

      await this.transcribeAudio(transcript, dir, meta.duration, step);
      step(`completed via audio transcription in ${elapsedSeconds(startedAt)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`#${transcript.id} failed after ${elapsedSeconds(startedAt)}: ${message}`);
      await transcript
        .update({ status: 'failed', error: message.slice(0, 500) })
        .catch((updateErr) => this.logger.error(`Could not persist failure: ${updateErr}`));
    } finally {
      if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async withFriendlyError<T>(transcript: Transcript, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const stderr = ((err as { stderr?: string }).stderr ?? '').toLowerCase();
      let message = 'Could not read this video — it may be private, deleted or region-locked.';
      if (transcript.platform === 'instagram' && /login|auth|rate/.test(stderr)) {
        message +=
          ' Instagram often requires a logged-in session: set IG_COOKIES_BROWSER=chrome in backend/.env and retry.';
      }
      throw new Error(message);
    }
  }

  private async readCaptions(tmpDir: string, step: (message: string) => void): Promise<string | null> {
    const files = await fs.readdir(tmpDir);
    const json3 = files.find((file) => file.endsWith('.json3'));
    if (!json3) return null;
    step(`caption track saved: ${json3} — parsing`);
    const text = parseJson3Captions(await fs.readFile(path.join(tmpDir, json3), 'utf8'));
    return text || null;
  }

  private async transcribeAudio(
    transcript: Transcript,
    tmpDir: string,
    duration: number | null,
    step: (message: string) => void,
  ) {
    if (!this.transcription.enabled) throw new Error(NO_KEY_ERROR);

    const maxMinutes = Number(process.env.MAX_AUDIO_MINUTES) || 30;
    if (duration && duration > maxMinutes * 60) {
      throw new Error(
        `This video is ${Math.ceil(duration / 60)} minutes long — above the ${maxMinutes}-minute transcription limit.`,
      );
    }

    step('step 2: downloading audio (yt-dlp → ffmpeg → mp3)');
    const ffmpegDir = path.dirname(ffmpegPath as unknown as string);
    await this.ytdlp.downloadAudio(transcript.url, tmpDir, ffmpegDir, transcript.platform);
    const audioPath = path.join(tmpDir, 'audio.mp3');
    const audioMb = ((await fs.stat(audioPath)).size / 1024 / 1024).toFixed(1);
    step(`step 3: audio ready (${audioMb} MB) — sending to OpenAI ${this.transcription.model}`);
    const text = await this.transcription.transcribe(audioPath);
    step(`transcription received — ${wordCount(text)} words`);
    await transcript.update({ text, source: 'whisper', status: 'completed' });
  }
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
