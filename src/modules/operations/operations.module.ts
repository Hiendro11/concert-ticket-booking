import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';

import { UserContextGuard } from '../../common/auth/user-context.guard';
import { OperatorGuard } from '../../common/auth/operator.guard';

import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [DatabaseModule],

  controllers: [
    OperationsController,
  ],

  providers: [
    OperationsService,
    UserContextGuard,
    OperatorGuard,
  ],
})
export class OperationsModule {}