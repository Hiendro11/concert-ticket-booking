import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { UserContextGuard } from '../../common/auth/user-context.guard';
import { OperatorGuard } from '../../common/auth/operator.guard';

import { ConcertIdParamDto } from '../concerts/dto/concert-id-param.dto';

import { OperationsService } from './operations.service';
import { CreateConcertDto } from './dto/create-concert.dto';
import { CreateTicketCategoryDto } from './dto/create-ticket-category.dto';
import {
  ConcertInventoryResponseDto,
  OperationsConcertResponseDto,
  TicketCategoryOperationResponseDto,
} from './dto/operations-concert-response.dto';

@ApiTags('Operations - Concerts')
@ApiSecurity('user-id')
@UseGuards(
  UserContextGuard,
  OperatorGuard,
)
@Controller('ops/concerts')
export class OperationsController {
  constructor(
    private readonly operationsService: OperationsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a draft concert',
  })
  @ApiCreatedResponse({
    type: OperationsConcertResponseDto,
  })
  createConcert(
    @Body() dto: CreateConcertDto,
  ) {
    return this.operationsService.createConcert(
      dto,
    );
  }

  @Post(':concertId/ticket-categories')
  @ApiOperation({
    summary:
      'Add a ticket category to a draft concert',
  })
  @ApiCreatedResponse({
    type: TicketCategoryOperationResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Concert not found.',
  })
  @ApiConflictResponse({
    description:
      'Concert is not editable or category already exists.',
  })
  createTicketCategory(
    @Param() params: ConcertIdParamDto,
    @Body() dto: CreateTicketCategoryDto,
  ) {
    return this.operationsService.createTicketCategory(
      params.concertId,
      dto,
    );
  }

  @Post(':concertId/publish')
  @ApiOperation({
    summary: 'Publish a concert',
  })
  @ApiOkResponse({
    type: OperationsConcertResponseDto,
  })
  publishConcert(
    @Param() params: ConcertIdParamDto,
  ) {
    return this.operationsService.publishConcert(
      params.concertId,
    );
  }

  @Get(':concertId/inventory')
  @ApiOperation({
    summary: 'View concert ticket inventory',
  })
  @ApiOkResponse({
    type: ConcertInventoryResponseDto,
  })
  getInventory(
    @Param() params: ConcertIdParamDto,
  ) {
    return this.operationsService.getInventory(
      params.concertId,
    );
  }
}