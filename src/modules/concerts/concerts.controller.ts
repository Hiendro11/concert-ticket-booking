import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';

import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ConcertsService } from './concerts.service';
import { ConcertIdParamDto } from './dto/concert-id-param.dto';
import { ConcertResponseDto } from './dto/concert-response.dto';

@ApiTags('Concerts')
@Controller('concerts')
export class ConcertsController {
  constructor(
    private readonly concertsService: ConcertsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List published concerts',
  })
  @ApiOkResponse({
    type: ConcertResponseDto,
    isArray: true,
  })
  findAll(): Promise<ConcertResponseDto[]> {
    return this.concertsService.findAll();
  }

  @Get(':concertId')
  @ApiOperation({
    summary: 'Get a published concert',
  })
  @ApiParam({
    name: 'concertId',
    example: '3001',
  })
  @ApiOkResponse({
    type: ConcertResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'Concert does not exist or is not publicly available.',
  })
  findOne(
    @Param() params: ConcertIdParamDto,
  ): Promise<ConcertResponseDto> {
    return this.concertsService.findOne(
      params.concertId,
    );
  }
}