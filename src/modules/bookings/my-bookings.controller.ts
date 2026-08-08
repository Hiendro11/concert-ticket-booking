import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { UserContextGuard } from '../../common/auth/user-context.guard';

import { BookingsService } from './bookings.service';

import { BookingListQueryDto } from './dto/booking-list-query.dto';
import { BookingListResponseDto } from './dto/booking-response.dto';

@ApiTags('Customer - Bookings')
@ApiSecurity('user-id')
@UseGuards(UserContextGuard)
@Controller('me/bookings')
export class MyBookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List bookings for the current user',
  })
  @ApiOkResponse({
    type: BookingListResponseDto,
  })
  findAll(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: BookingListQueryDto,
  ): Promise<BookingListResponseDto> {
    return this.bookingsService.findMyBookings(
      user.id,
      query,
    );
  }
}
