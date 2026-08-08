import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateConcertDto {
  @ApiProperty({
    example: 'Midnight Echo Live 2026',
  })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({
    example: 'SECC, Ho Chi Minh City',
  })
  @IsString()
  @Length(1, 255)
  venue!: string;

  @ApiPropertyOptional({
    example: 'A new live concert.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({
    example: '2026-11-15T12:00:00.000Z',
  })
  @IsISO8601()
  startsAt!: string;
}