import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class OperationsConcertResponseDto {
  @ApiProperty({
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
  @ApiProperty()
  id!: string;

  @ApiProperty()
  concertId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    example: '1500000.00',
  })
  price!: string;

  @ApiProperty()
  totalQuantity!: number;

  @ApiProperty()
  availableQuantity!: number;
}

export class InventoryCategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  price!: string;

  @ApiProperty()
  totalQuantity!: number;

  @ApiProperty()
  availableQuantity!: number;

  @ApiProperty()
  soldQuantity!: number;
}

export class ConcertInventoryResponseDto {
  @ApiProperty()
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