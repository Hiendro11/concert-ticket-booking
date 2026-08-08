import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class OperationsConcertResponseDto {
  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
    example: '3001',
  })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  venue!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  description!: string | null;

  @ApiProperty()
  startsAt!: string;

  @ApiProperty({
    enum: ['DRAFT', 'PUBLISHED', 'CANCELLED'],
  })
  status!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  publishedAt!: string | null;
}

export class TicketCategoryOperationResponseDto {
  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
  })
  id!: string;

  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
  })
  concertId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    type: String,
    description: 'Ticket price as a decimal string.',
    example: '1500000.00',
  })
  price!: string;

  @ApiProperty()
  totalQuantity!: number;

  @ApiProperty()
  availableQuantity!: number;
}

export class InventoryCategoryResponseDto {
  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
  })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    type: String,
    description: 'Ticket price as a decimal string.',
  })
  price!: string;

  @ApiProperty()
  totalQuantity!: number;

  @ApiProperty()
  availableQuantity!: number;

  @ApiProperty()
  soldQuantity!: number;
}

export class ConcertInventoryResponseDto {
  @ApiProperty({
    type: String,
    description: 'BigInt ID serialized as string.',
  })
  concertId!: string;

  @ApiProperty()
  concertName!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({
    type: [InventoryCategoryResponseDto],
  })
  categories!: InventoryCategoryResponseDto[];
}