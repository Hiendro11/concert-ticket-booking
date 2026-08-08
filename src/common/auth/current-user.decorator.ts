import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

import {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-user';

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedUser => {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new Error(
        'CurrentUser used without UserContextGuard.',
      );
    }

    return request.user;
  },
);