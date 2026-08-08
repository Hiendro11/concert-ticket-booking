import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class BookingResponseDto {
  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
    example: '6001',
  })
  id!: string;

  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
    example: '2001',
  })
  userId!: string;

  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
    example: '3001',
  })
  concertId!: string;

  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
    example: '4001',
  })
  ticketCategoryId!: string;

  @ApiProperty({
    example: 2,
  })
  quantity!: number;

  @ApiProperty({
    type: String,
    description: 'Money amount as a decimal string.',
    example: '2000000.00',
  })
  unitPrice!: string;

  @ApiProperty({
    type: String,
    description: 'Money amount as a decimal string.',
    example: '4000000.00',
  })
  subtotal!: string;

  @ApiProperty({
    type: String,
    description: 'Money amount as a decimal string.',
    example: '0.00',
  })
  discountAmount!: string;

  @ApiProperty({
    type: String,
    description: 'Money amount as a decimal string.',
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