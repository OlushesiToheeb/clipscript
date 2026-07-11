import { Injectable } from '@nestjs/common';
import { createReadStream } from 'fs';
import OpenAI from 'openai';

@Injectable()
export class TranscriptionService {
  private client: OpenAI | null = null;

  get enabled(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  get model(): string {
    return process.env.TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
  }

  async transcribe(audioPath: string): Promise<string> {
    this.client ??= new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      // Fail rather than hang forever if the API stalls.
      timeout: Number(process.env.OPENAI_TIMEOUT_MS) || 240000,
    });
    const result = await this.client.audio.transcriptions.create({
      model: this.model,
      file: createReadStream(audioPath),
    });
    return result.text;
  }
}
