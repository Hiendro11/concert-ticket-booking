import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({
    example: '3001',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message:
      'concertId must be a positive integer string',
  })
  concertId!: string;

  @ApiProperty({
    example: '4001',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message:
      'ticketCategoryId must be a positive integer string',
  })
  ticketCategoryId!: string;

  @ApiProperty({
    example: 2,
    minimum: 1,
    maximum: 10,
  })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;

  @ApiPropertyOptional({
    example: 'GEEK10',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  voucherCode?: string;
}