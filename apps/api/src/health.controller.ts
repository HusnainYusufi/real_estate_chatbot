import { Controller, Get } from '@nestjs/common';

/** Liveness endpoint for load balancers and Docker healthchecks. */
@Controller()
export class HealthController {
  @Get('healthz')
  health() {
    return { ok: true, service: 'api' };
  }
}
