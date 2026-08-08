import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ConcertIdParamDto {
  @ApiProperty({
    example: '3001',
    description: 'Concert ID serialized as a string.',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'concertId must be a positive integer string',
  })
  concertId!: string;
}