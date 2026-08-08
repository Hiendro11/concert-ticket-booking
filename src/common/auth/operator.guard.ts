import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';
import { AuthenticatedRequest } from './authenticated-user';

@Injectable()
export class OperatorGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new AppException(
        ErrorCode.USER_ID_REQUIRED,
        'Authenticated user context is missing.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (request.user.role !== 'OPERATOR') {
      throw new AppException(
        ErrorCode.OPERATOR_ACCESS_REQUIRED,
        'Operator access is required.',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}