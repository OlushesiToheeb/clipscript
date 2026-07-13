import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

// A tiny liveness probe for Render's health check (healthCheckPath: /health).
// Skipped by the throttler so the platform's frequent pings never eat a visitor's
// rate-limit budget.
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
