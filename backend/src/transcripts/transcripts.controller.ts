import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { Response } from 'express';
import { Transcript } from './transcript.model';
import { TranscriptsService } from './transcripts.service';

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
  ): Promise<Transcript> {
    const { transcript, created } = await this.transcriptsService.create(dto.url);
    res.status(created ? 201 : 200);
    return transcript;
  }

  @Get()
  findAll(): Promise<Transcript[]> {
    return this.transcriptsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Transcript> {
    return this.transcriptsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.transcriptsService.remove(id);
  }
}
