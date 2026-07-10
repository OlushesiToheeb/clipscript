import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Transcript } from './transcript.model';
import { TranscriptionService } from './transcription.service';
import { TranscriptsController } from './transcripts.controller';
import { TranscriptsService } from './transcripts.service';
import { YtdlpService } from './ytdlp.service';

@Module({
  imports: [SequelizeModule.forFeature([Transcript])],
  controllers: [TranscriptsController],
  providers: [TranscriptsService, YtdlpService, TranscriptionService],
})
export class TranscriptsModule {}
