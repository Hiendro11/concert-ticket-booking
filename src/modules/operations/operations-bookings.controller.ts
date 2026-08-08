import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { OperatorGuard } from '../../common/auth/operator.guard';
import { UserContextGuard } from '../../common/auth/user-context.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';

import { BookingsService } from '../bookings/bookings.service';

import { BookingIdParamDto } from '../bookings/dto/booking-id-param.dto';

import {
  BookingListResponseDto,
  BookingResponseDto,
} from '../bookings/dto/booking-response.dto';

import { OperationsBookingListQueryDto } from '../bookings/dto/operations-booking-list-query.dto';
import { UpdateBookingStatusDto } from '../bookings/dto/update-booking-status.dto';

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

  @Patch(':bookingId/status')
  @ApiOperation({
    summary:
      'Update booking status',
  })
  @ApiOkResponse({
    type: BookingResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'Booking was not found.',
  })
  @ApiConflictResponse({
    description:
      'Invalid booking status transition.',
  })
  updateStatus(
    @CurrentUser()
    operator: AuthenticatedUser,

    @Param()
    params: BookingIdParamDto,

    @Body()
    dto: UpdateBookingStatusDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService
      .updateStatusForOperations(
        operator.id,
        params.bookingId,
        dto,
      );
  }
}
