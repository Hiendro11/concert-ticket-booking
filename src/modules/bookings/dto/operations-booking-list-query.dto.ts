import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

import { BookingListQueryDto } from './booking-list-query.dto';

export class OperationsBookingListQueryDto
  extends BookingListQueryDto
{
  @ApiPropertyOptional({
    example: '3001',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message:
      'concertId must be a positive integer string',
  })
  concertId?: string;

  @ApiPropertyOptional({
    enum: [
      'PENDING_PAYMENT',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
    ],
  })
  @IsOptional()
  @IsIn([
    'PENDING_PAYMENT',
    'CONFIRMED',
    'CANCELLED',
    'EXPIRED',
  ])
  status?: string;
}
