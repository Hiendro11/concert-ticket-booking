import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class BookingIdParamDto {
  @ApiProperty({
    example: '199',
    description: 'Booking ID serialized as a string.',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message:
      'bookingId must be a positive integer string',
  })
  bookingId!: string;
}
