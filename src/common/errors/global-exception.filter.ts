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
        if (Array.isArray(body.message)) {
          message = 'Request validation failed.';
          details = body.message;
          code = body.code ?? ErrorCode.VALIDATION_ERROR;
        } else {
          if (body.message) {
            message = body.message;
          }
          if (body.code) {
            code = body.code;
          } else {
            switch (status) {
              case HttpStatus.BAD_REQUEST:
                code = 'BAD_REQUEST';
                break;
              case HttpStatus.UNAUTHORIZED:
                code = 'UNAUTHORIZED';
                break;
              case HttpStatus.FORBIDDEN:
                code = 'FORBIDDEN';
                break;
              case HttpStatus.NOT_FOUND:
                code = 'NOT_FOUND';
                break;
              case HttpStatus.CONFLICT:
                code = 'CONFLICT';
                break;
            }
          }
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