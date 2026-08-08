import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
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
import { BookingIdParamDto } from './dto/booking-id-param.dto';
import { BookingResponseDto } from './dto/booking-response.dto';

@ApiTags('Customer - Bookings')
@ApiSecurity('user-id')
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
  ) {}

  @Post()
  @UseGuards(UserContextGuard)
  @ApiSecurity('idempotency-key')
  @ApiOperation({
    summary:
      'Create an idempotent ticket booking',
  })
  @ApiCreatedResponse({
    type: BookingResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_ERROR, IDEMPOTENCY_KEY_REQUIRED',
  })
  @ApiNotFoundResponse({
    description:
      'VOUCHER_NOT_FOUND, TICKET_CATEGORY_NOT_FOUND',
  })
  @ApiConflictResponse({
    description:
      'INSUFFICIENT_TICKET_INVENTORY, IDEMPOTENCY_KEY_CONFLICT, VOUCHER_INACTIVE, VOUCHER_NOT_STARTED, VOUCHER_EXPIRED, VOUCHER_USAGE_LIMIT_REACHED, VOUCHER_ALREADY_USED, CONCERT_NOT_PUBLISHED',
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

  @Get(':bookingId')
  @UseGuards(UserContextGuard)
  @ApiOperation({
    summary:
      'Get one of the current user bookings',
  })
  @ApiOkResponse({
    type: BookingResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'Booking does not exist or does not belong to the current user.',
  })
  findOne(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param()
    params: BookingIdParamDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.findOneForUser(
      user.id,
      params.bookingId,
    );
  }
}