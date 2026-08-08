import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TicketCategoryResponseDto {
  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
    example: '4001',
  })
  id!: string;

  @ApiProperty({
    example: 'VIP',
  })
  name!: string;

  @ApiProperty({
    type: String,
    example: '2000000.00',
    description: 'Ticket price as a decimal string.',
  })
  price!: string;

  @ApiProperty({
    example: 20,
  })
  totalQuantity!: number;

  @ApiProperty({
    example: 18,
  })
  availableQuantity!: number;
}

export class ConcertResponseDto {
  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
    example: '3001',
  })
  id!: string;

  @ApiProperty({
    example: 'Neon Pulse Live 2026',
  })
  name!: string;

  @ApiProperty({
    example:
      'Saigon Exhibition & Convention Center, Ho Chi Minh City',
  })
  venue!: string;

  @ApiPropertyOptional({
    example:
      'High-demand concert fixture for flash-sale booking tests.',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    example: '2026-09-20T12:00:00.000Z',
  })
  startsAt!: string;

  @ApiProperty({
    example: 'PUBLISHED',
    enum: ['PUBLISHED'],
  })
  status!: string;

  @ApiProperty({
    type: [TicketCategoryResponseDto],
  })
  ticketCategories!: TicketCategoryResponseDto[];
}