import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';

import { UserContextGuard } from '../../common/auth/user-context.guard';
import { OperatorGuard } from '../../common/auth/operator.guard';

import { BookingsModule } from '../bookings/bookings.module';

import { OperationsController } from './operations.controller';
import { OperationsBookingsController } from './operations-bookings.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [
    DatabaseModule,
    BookingsModule,
  ],

  controllers: [
    OperationsController,
    OperationsBookingsController,
  ],

  providers: [
    OperationsService,
    UserContextGuard,
    OperatorGuard,
  ],
})
export class OperationsModule {}