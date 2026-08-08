import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { OperatorGuard } from '../../common/auth/operator.guard';
import { UserContextGuard } from '../../common/auth/user-context.guard';

import { BookingsService } from '../bookings/bookings.service';

import { BookingIdParamDto } from '../bookings/dto/booking-id-param.dto';

import {
  BookingListResponseDto,
  BookingResponseDto,
} from '../bookings/dto/booking-response.dto';

import { OperationsBookingListQueryDto } from '../bookings/dto/operations-booking-list-query.dto';

@ApiTags('Operations - Bookings')
@ApiSecurity('user-id')
@UseGuards(
  UserContextGuard,
  OperatorGuard,
)
@Controller('ops/bookings')
export class OperationsBookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List bookings for operations',
  })
  @ApiOkResponse({
    type: BookingListResponseDto,
  })
  findAll(
    @Query()
    query: OperationsBookingListQueryDto,
  ): Promise<BookingListResponseDto> {
    return this.bookingsService
      .findBookingsForOperations(
        query,
      );
  }

  @Get(':bookingId')
  @ApiOperation({
    summary:
      'Get booking details for operations',
  })
  @ApiOkResponse({
    type: BookingResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'Booking was not found.',
  })
  findOne(
    @Param()
    params: BookingIdParamDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService
      .findOneForOperations(
        params.bookingId,
      );
  }
}
