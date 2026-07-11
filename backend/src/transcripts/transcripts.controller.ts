import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
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
