import { Injectable } from '@nestjs/common';
import { createReadStream } from 'fs';
import OpenAI from 'openai';

@Injectable()
export class TranscriptionService {
  private client: OpenAI | null = null;

  get enabled(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async transcribe(audioPath: string): Promise<string> {
    this.client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await this.client.audio.transcriptions.create({
      model: process.env.TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
      file: createReadStream(audioPath),
    });
    return result.text;
  }
}
