import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsString } from 'class-validator';
import { Response } from 'express';
import { PublicTranscript, TranscriptsService } from './transcripts.service';

class CreateTranscriptDto {
  @IsString()
  @IsNotEmpty()
  url!: string;
}

@Controller('transcripts')
export class TranscriptsController {
  constructor(private readonly transcriptsService: TranscriptsService) {}

  // The expensive path: each new URL can trigger a yt-dlp download + a paid OpenAI
  // transcription. Cap it tight (10/min per IP) so one visitor can't run up the bill.
  // The generous global limit still applies to the GET polling path below.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(
    @Body() dto: CreateTranscriptDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicTranscript> {
    const { transcript, created } = await this.transcriptsService.create(dto.url);
    res.status(created ? 201 : 200);
    return this.transcriptsService.toPublic(transcript);
  }

  // Read by unguessable token only — there is deliberately no "list everything"
  // route, so one visitor cannot see another's transcripts.
  @Get(':token')
  async findByToken(@Param('token') token: string): Promise<PublicTranscript> {
    return this.transcriptsService.toPublic(await this.transcriptsService.findByToken(token));
  }
}
