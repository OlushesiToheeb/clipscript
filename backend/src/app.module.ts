import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { SequelizeModule } from '@nestjs/sequelize';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { TranscriptsModule } from './transcripts/transcripts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SequelizeModule.forRootAsync({
      useFactory: () => ({
        dialect: 'postgres',
        uri: process.env.DATABASE_URL,
        autoLoadModels: true,
        synchronize: true,
        logging: false,
      }),
    }),
    // Global rate limit — generous, because the browser polls GET /transcripts/:token
    // every 1.5s while a job runs. The expensive POST path is throttled far tighter
    // at the controller (see TranscriptsController).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    TranscriptsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
