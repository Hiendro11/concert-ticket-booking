import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  NextFunction,
  Request,
  Response,
} from 'express';

export interface RequestWithId extends Request {
  requestId: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: RequestWithId,
    res: Response,
    next: NextFunction,
  ): void {
    const incomingRequestId = req.header('x-request-id');

    const requestId =
      incomingRequestId &&
      incomingRequestId.length <= 128
        ? incomingRequestId
        : randomUUID();

    req.requestId = requestId;

    res.setHeader('X-Request-Id', requestId);

    next();
  }
}