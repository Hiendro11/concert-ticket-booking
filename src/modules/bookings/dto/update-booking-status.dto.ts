import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateBookingStatusDto {
  @ApiProperty({
    enum: [
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
    ],
    example: 'CONFIRMED',
  })
  @IsString()
  @IsIn([
    'CONFIRMED',
    'CANCELLED',
    'EXPIRED',
  ])
  status!:
    | 'CONFIRMED'
    | 'CANCELLED'
    | 'EXPIRED';

  @ApiPropertyOptional({
    example:
      'Payment confirmed by operations.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
