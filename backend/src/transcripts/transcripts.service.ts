import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Op } from 'sequelize';
import { parseJson3Captions } from './captions.utils';
import { Transcript } from './transcript.model';
import { TranscriptionService } from './transcription.service';
import { elapsedSeconds } from './time.utils';
import { detectPlatform, normalizeUrl } from './url.utils';
import { YtdlpService } from './ytdlp.service';

const NO_KEY_ERROR =
  'This video has no captions — transcribing its audio needs an OpenAI API key. Set OPENAI_API_KEY in backend/.env and retry.';

@Injectable()
export class TranscriptsService {
  private readonly logger = new Logger(TranscriptsService.name);

  constructor(
    @InjectModel(Transcript) private readonly transcriptModel: typeof Transcript,
    private readonly ytdlp: YtdlpService,
    private readonly transcription: TranscriptionService,
  ) {}

  async create(rawUrl: string): Promise<{ transcript: Transcript; created: boolean }> {
    const platform = detectPlatform(rawUrl);
    const url = normalizeUrl(rawUrl);
    if (!platform || !url) {
      throw new BadRequestException('Not a recognizable YouTube, TikTok or Instagram video URL.');
    }

    const existing = await this.transcriptModel.findOne({
      where: { url, status: { [Op.in]: ['completed', 'processing'] } },
      order: [['id', 'DESC']],
    });
    if (existing) {
      this.logger.log(`#${existing.id} cache hit (${existing.status}) — reusing for ${url}`);
      return { transcript: existing, created: false };
    }

    const transcript = await this.transcriptModel.create({ url, platform, status: 'processing' });
    this.logger.log(`#${transcript.id} created (${platform}) — ${url}`);
    this.process(transcript).catch((err) => this.logger.error(`Unhandled processing error: ${err}`));
    return { transcript, created: true };
  }

  async findAll(): Promise<Transcript[]> {
    return this.transcriptModel.findAll({ order: [['id', 'DESC']], limit: 50 });
  }

  async findOne(id: number): Promise<Transcript> {
    const transcript = await this.transcriptModel.findByPk(id);
    if (!transcript) throw new NotFoundException(`Transcript ${id} not found`);
    return transcript;
  }

  async remove(id: number): Promise<void> {
    const transcript = await this.findOne(id);
    await transcript.destroy();
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
