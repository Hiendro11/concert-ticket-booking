import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class BookingResponseDto {
  @ApiProperty({
    example: '6001',
  })
  id!: string;

  @ApiProperty({
    example: '2001',
  })
  userId!: string;

  @ApiProperty({
    example: '3001',
  })
  concertId!: string;

  @ApiProperty({
    example: '4001',
  })
  ticketCategoryId!: string;

  @ApiProperty({
    example: 2,
  })
  quantity!: number;

  @ApiProperty({
    example: '2000000.00',
  })
  unitPrice!: string;

  @ApiProperty({
    example: '4000000.00',
  })
  subtotal!: string;

  @ApiProperty({
    example: '0.00',
  })
  discountAmount!: string;

  @ApiProperty({
    example: '4000000.00',
  })
  totalAmount!: string;

  @ApiProperty({
    enum: [
      'PENDING_PAYMENT',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
    ],
  })
  status!: string;

  @ApiPropertyOptional({
    example: 'GEEK10',
    nullable: true,
  })
  voucherCode!: string | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  expiresAt!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class BookingListResponseDto {
  @ApiProperty({
    type: [BookingResponseDto],
  })
  items!: BookingResponseDto[];

  @ApiPropertyOptional({
    example: '150',
    nullable: true,
  })
  nextCursor!: string | null;
}