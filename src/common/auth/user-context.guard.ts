import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma/prisma.service';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';
import { AuthenticatedRequest } from './authenticated-user';

@Injectable()
export class UserContextGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userIdHeader = request.header('X-User-Id');

    if (!userIdHeader) {
      throw new AppException(
        ErrorCode.USER_ID_REQUIRED,
        'X-User-Id header is required.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!/^[1-9]\d*$/.test(userIdHeader)) {
      throw new AppException(
        ErrorCode.INVALID_USER_ID,
        'X-User-Id must be a positive integer string.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: BigInt(userIdHeader),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        'User was not found.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.user = user;

    return true;
  }
}