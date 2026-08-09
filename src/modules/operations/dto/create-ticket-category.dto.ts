import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  Length,
} from 'class-validator';

export class CreateTicketCategoryDto {
  @ApiProperty({
    example: 'VIP',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    example: '1500000.00',
    description: 'Price as a decimal string.',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      'price must be a non-negative decimal with at most 2 decimal places',
  })
  price!: string;

  @ApiProperty({
    example: 100,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  totalQuantity!: number;
}