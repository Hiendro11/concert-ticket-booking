import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';

import { UserContextGuard } from '../../common/auth/user-context.guard';

import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [DatabaseModule],

  controllers: [
    BookingsController,
  ],

  providers: [
    BookingsService,
    UserContextGuard,
  ],

  exports: [
    BookingsService,
  ],
})
export class BookingsModule {}