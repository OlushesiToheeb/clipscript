import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
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
    TranscriptsModule,
  ],
})
export class AppModule {}
