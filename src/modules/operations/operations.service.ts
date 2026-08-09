import {
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';

import { PrismaService } from '../../database/prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';

import { CreateConcertDto } from './dto/create-concert.dto';
import { CreateTicketCategoryDto } from './dto/create-ticket-category.dto';

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createConcert(dto: CreateConcertDto) {
    const startsAt = new Date(dto.startsAt);

    if (startsAt <= new Date()) {
      throw new AppException(
        ErrorCode.CONCERT_NOT_PUBLISHABLE,
        'Concert start time must be in the future.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const concert = await this.prisma.concert.create({
      data: {
        name: dto.name.trim(),
        venue: dto.venue.trim(),
        description: dto.description?.trim() || null,
        startsAt,
        status: 'DRAFT',
      },
    });

    return this.toConcertResponse(concert);
  }

  async createTicketCategory(
    concertId: string,
    dto: CreateTicketCategoryDto,
  ) {
    const id = BigInt(concertId);

    return this.prisma.$transaction(async (tx) => {
      /*
       * Lock the concert row first to prevent a TOCTOU race
       * where publishConcert() changes status between our
       * SELECT and INSERT.
       */
      const rows = await tx.$queryRaw<
        { id: bigint; status: string }[]
      >`
        SELECT id, status
        FROM concerts
        WHERE id = ${id}
        FOR UPDATE
      `;

      const concert = rows[0];

      if (!concert) {
        throw new AppException(
          ErrorCode.CONCERT_NOT_FOUND,
          'Concert was not found.',
          HttpStatus.NOT_FOUND,
        );
      }

      if (concert.status !== 'DRAFT') {
        throw new AppException(
          ErrorCode.CONCERT_ALREADY_PUBLISHED,
          'Ticket categories can only be changed while the concert is in DRAFT status.',
          HttpStatus.CONFLICT,
        );
      }

      try {
        const category =
          await tx.ticketCategory.create({
            data: {
              concertId: id,
              name: dto.name.trim(),
              price: dto.price,
              totalQuantity: dto.totalQuantity,
              availableQuantity:
                dto.totalQuantity,
            },
          });

        return {
          id: category.id.toString(),
          concertId:
            category.concertId.toString(),
          name: category.name,
          price: category.price.toFixed(2),
          totalQuantity:
            category.totalQuantity,
          availableQuantity:
            category.availableQuantity,
        };
      } catch (error: unknown) {
        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new AppException(
            ErrorCode.TICKET_CATEGORY_ALREADY_EXISTS,
            'A ticket category with this name already exists for the concert.',
            HttpStatus.CONFLICT,
          );
        }

        throw error;
      }
    });
  }

  async publishConcert(concertId: string) {
    const id = BigInt(concertId);

    return this.prisma.$transaction(async (tx) => {
      /*
       * Lock the concert row first to serialize
       * against concurrent createTicketCategory calls.
       */
      const rows = await tx.$queryRaw<
        { id: bigint; status: string; starts_at: Date }[]
      >`
        SELECT id, status, starts_at
        FROM concerts
        WHERE id = ${id}
        FOR UPDATE
      `;

      const concertRow = rows[0];

      if (!concertRow) {
        throw new AppException(
          ErrorCode.CONCERT_NOT_FOUND,
          'Concert was not found.',
          HttpStatus.NOT_FOUND,
        );
      }

      if (concertRow.status !== 'DRAFT') {
        throw new AppException(
          ErrorCode.CONCERT_ALREADY_PUBLISHED,
          'Only a DRAFT concert can be published.',
          HttpStatus.CONFLICT,
        );
      }

      if (concertRow.starts_at <= new Date()) {
        throw new AppException(
          ErrorCode.CONCERT_NOT_PUBLISHABLE,
          'Concert start time must be in the future.',
          HttpStatus.CONFLICT,
        );
      }

      const categoryCount =
        await tx.ticketCategory.count({
          where: { concertId: id },
        });

      if (categoryCount === 0) {
        throw new AppException(
          ErrorCode.CONCERT_NOT_PUBLISHABLE,
          'Concert must have at least one ticket category before publishing.',
          HttpStatus.CONFLICT,
        );
      }

      const publishedAt = new Date();

      const updated = await tx.concert.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt,
        },
      });

      return this.toConcertResponse(updated);
    });
  }


  async getInventory(concertId: string) {
    const id = BigInt(concertId);

    const concert =
      await this.prisma.concert.findUnique({
        where: {
          id,
        },
        include: {
          ticketCategories: {
            orderBy: {
              id: 'asc',
            },
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

    return {
      concertId: concert.id.toString(),
      concertName: concert.name,
      status: concert.status,

      categories:
        concert.ticketCategories.map(
          (category) => ({
            id: category.id.toString(),
            name: category.name,
            price: category.price.toFixed(2),
            totalQuantity:
              category.totalQuantity,
            availableQuantity:
              category.availableQuantity,
            reservedOrSoldQuantity:
              category.totalQuantity -
              category.availableQuantity,
          }),
        ),
    };
  }

  private toConcertResponse(concert: {
    id: bigint;
    name: string;
    venue: string;
    description: string | null;
    startsAt: Date;
    status: string;
    publishedAt: Date | null;
  }) {
    return {
      id: concert.id.toString(),
      name: concert.name,
      venue: concert.venue,
      description: concert.description,
      startsAt:
        concert.startsAt.toISOString(),
      status: concert.status,
      publishedAt:
        concert.publishedAt?.toISOString() ??
        null,
    };
  }
}