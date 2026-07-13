import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// Allowed browser origins. Locally this is the Next.js dev server; in production
// it's the deployed frontend, set via FRONTEND_URL (comma-separated if you have
// more than one). Trailing slashes are trimmed so "https://site/" and
// "https://site" both match.
function corsOrigins(): string[] {
  const fromEnv = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return fromEnv.length ? fromEnv : ['http://localhost:4601'];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Render terminates TLS at its proxy and forwards X-Forwarded-For. Trusting the
  // first hop lets the throttler rate-limit by the real visitor IP, not the proxy's.
  app.set('trust proxy', 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: corsOrigins() });
  await app.listen(process.env.PORT || 4600);
}

void bootstrap();
