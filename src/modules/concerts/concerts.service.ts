import {
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../database/prisma/prisma.service';

import {
  ConcertResponseDto,
  TicketCategoryResponseDto,
} from './dto/concert-response.dto';

type ConcertRecord = {
  id: bigint;
  name: string;
  venue: string;
  description: string | null;
  startsAt: Date;
  status: string;

  ticketCategories: Array<{
    id: bigint;
    name: string;

    price: {
      toString(): string;
      toFixed(decimalPlaces?: number): string;
    };

    totalQuantity: number;
    availableQuantity: number;
  }>;
};

@Injectable()
export class ConcertsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(): Promise<ConcertResponseDto[]> {
    const concerts =
      await this.prisma.concert.findMany({
        where: {
          status: 'PUBLISHED',
        },

        include: {
          ticketCategories: {
            orderBy: [
              {
                price: 'asc',
              },
              {
                id: 'asc',
              },
            ],
          },
        },

        orderBy: [
          {
            startsAt: 'asc',
          },
          {
            id: 'asc',
          },
        ],
      });

    return concerts.map((concert) =>
      this.toResponse(concert),
    );
  }

  async findOne(
    concertId: string,
  ): Promise<ConcertResponseDto> {
    const id = BigInt(concertId);

    const concert =
      await this.prisma.concert.findFirst({
        where: {
          id,
          status: 'PUBLISHED',
        },

        include: {
          ticketCategories: {
            orderBy: [
              {
                price: 'asc',
              },
              {
                id: 'asc',
              },
            ],
          },
        },
      });

    if (!concert) {
      throw new AppException(
        ErrorCode.CONCERT_NOT_FOUND,
        'Concert was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.toResponse(concert);
  }

  private toResponse(
    concert: ConcertRecord,
  ): ConcertResponseDto {
    return {
      id: concert.id.toString(),
      name: concert.name,
      venue: concert.venue,
      description: concert.description,
      startsAt: concert.startsAt.toISOString(),
      status: concert.status,

      ticketCategories:
        concert.ticketCategories.map(
          (
            category,
          ): TicketCategoryResponseDto => ({
            id: category.id.toString(),
            name: category.name,
            price: category.price.toFixed(2),
            totalQuantity:
              category.totalQuantity,
            availableQuantity:
              category.availableQuantity,
          }),
        ),
    };
  }
}