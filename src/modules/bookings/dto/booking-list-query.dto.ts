import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class BookingListQueryDto {
  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    example: '199',
    description:
      'Return bookings after this cursor.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message:
      'cursor must be a positive integer string',
  })
  cursor?: string;
}
