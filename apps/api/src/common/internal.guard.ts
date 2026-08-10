import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { config } from '../config';

/** Guards service-to-service endpoints called by the AI engine. */
@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers['x-internal-key'] !== config.internalApiKey) {
      throw new UnauthorizedException('Invalid internal key');
    }
    return true;
  }
}
