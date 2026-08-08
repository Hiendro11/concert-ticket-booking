import {
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/auth/current-user.decorator';

import type {
  AuthenticatedUser,
} from '../../common/auth/authenticated-user';

import { UserContextGuard } from '../../common/auth/user-context.guard';

import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';

@ApiTags('Bookings')
@ApiSecurity('user-id')
@ApiSecurity('idempotency-key')
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
  ) {}

  @Post()
  @UseGuards(UserContextGuard)
  @ApiOperation({
    summary:
      'Create an idempotent ticket booking',
  })
  @ApiCreatedResponse({
    type: BookingResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid request or missing Idempotency-Key.',
  })
  @ApiConflictResponse({
    description:
      'Inventory unavailable or idempotency conflict.',
  })
  createBooking(
    @CurrentUser()
    user: AuthenticatedUser,

    @Headers('idempotency-key')
    idempotencyKey: string | undefined,

    @Body()
    dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.createBooking(
      user.id,
      idempotencyKey,
      dto,
    );
  }
}