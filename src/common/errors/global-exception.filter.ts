import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from './error-codes';
import { RequestWithId } from '../request/request-id.middleware';

interface ExceptionBody {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

@Catch()
export class GlobalExceptionFilter
  implements ExceptionFilter
{
  private readonly logger =
    new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const request =
      ctx.getRequest<RequestWithId>();

    const response = ctx.getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      if (exception instanceof Error) {
        this.logger.error(
          `${request.method} ${request.originalUrl} ` +
            `requestId=${request.requestId} ` +
            `${exception.message}`,
          exception.stack,
        );
      } else {
        this.logger.error(
          `${request.method} ${request.originalUrl} ` +
            `requestId=${request.requestId} ` +
            'Unknown exception',
        );
      }
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    let code: string =
      ErrorCode.INTERNAL_SERVER_ERROR;

    let message = 'An unexpected error occurred.';

    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      const body =
        exception.getResponse() as
          | string
          | ExceptionBody;

      if (typeof body === 'string') {
        message = body;
      } else {
        code =
          body.code ??
          (status === HttpStatus.BAD_REQUEST
            ? ErrorCode.VALIDATION_ERROR
            : code);

        if (Array.isArray(body.message)) {
          message = 'Request validation failed.';
          details = body.message;
        } else if (body.message) {
          message = body.message;
        }

        if (body.details !== undefined) {
          details = body.details;
        }
      }
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details !== undefined
        ? { details }
        : {}),
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      requestId: request.requestId,
    });
  }
}