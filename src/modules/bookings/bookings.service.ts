import {
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';


import {
  Prisma,
} from '../../generated/prisma/client';

import { PrismaService } from '../../database/prisma/prisma.service';

import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';

import { CreateBookingDto } from './dto/create-booking.dto';
import {
  BookingListResponseDto,
  BookingResponseDto,
} from './dto/booking-response.dto';
import { BookingListQueryDto } from './dto/booking-list-query.dto';
import { OperationsBookingListQueryDto } from './dto/operations-booking-list-query.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import {
  normalizeVoucherCode,
  createRequestHash as canonicalizeHash,
  type CanonicalBookingRequest,
} from './booking-canonicalize';
import { calculateDiscount } from './booking-pricing';

interface IdempotencyRow {
  id: bigint;
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  booking_id: bigint | null;
}

interface LockedBookingRow {
  id: bigint;
  ticket_category_id: bigint;
  quantity: number;
  status:
    | 'PENDING_PAYMENT'
    | 'CONFIRMED'
    | 'CANCELLED'
    | 'EXPIRED';
}

const MAX_DEADLOCK_RETRIES = 5;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private readonly bookingVoucherInclude = {
    voucherRedemption: {
      include: {
        voucher: {
          select: {
            code: true,
          },
        },
      },
    },
  } as const;

  async createBooking(
    userId: bigint,
    idempotencyKey: string | undefined,
    dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    const key = idempotencyKey?.trim();

    if (!key) {
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        'Idempotency-Key header is required.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (key.length > 128) {
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'Idempotency-Key must not exceed 128 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const voucherCode =
      this.normalizeVoucherCode(dto.voucherCode);

    const requestHash =
      this.createRequestHash(
        dto,
        voucherCode,
      );

    return this.runWithDeadlockRetry(
      userId,
      key,
      () => this.prisma.$transaction(
        async (tx) => {
        /*
         * 1. Claim idempotency key.
         */
        await tx.$executeRaw`
          INSERT INTO idempotency_keys (
            user_id,
            idempotency_key,
            request_hash,
            status,
            created_at,
            updated_at
          )
          VALUES (
            ${userId},
            ${key},
            ${requestHash},
            'PROCESSING',
            NOW(3),
            NOW(3)
          )
          ON DUPLICATE KEY UPDATE
            id = id
        `;

        const idempotencyRows =
          await tx.$queryRaw<
            IdempotencyRow[]
          >`
            SELECT
              id,
              request_hash,
              status,
              booking_id
            FROM idempotency_keys
            WHERE user_id = ${userId}
              AND idempotency_key = ${key}
            FOR UPDATE
          `;

        const idempotency =
          idempotencyRows[0];

        if (!idempotency) {
          throw new Error(
            'Idempotency record was not found after claim.',
          );
        }

        if (
          idempotency.request_hash !==
          requestHash
        ) {
          throw new AppException(
            ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
            'The same Idempotency-Key was already used with a different request.',
            HttpStatus.CONFLICT,
          );
        }

        /*
         * Retry of completed request.
         */
        if (
          idempotency.status ===
            'COMPLETED' &&
          idempotency.booking_id !== null
        ) {
          const existingBooking =
            await tx.booking.findUnique({
              where: {
                id: idempotency.booking_id,
              },

              include: {
                voucherRedemption: {
                  include: {
                    voucher: {
                      select: {
                        code: true,
                      },
                    },
                  },
                },
              },
            });

          if (!existingBooking) {
            throw new Error(
              'Completed idempotency record references a missing booking.',
            );
          }

          return this.toResponse(
            existingBooking,
            existingBooking
              .voucherRedemption?.voucher
              .code ?? null,
          );
        }

        /*
         * 2. Validate ticket/category.
         */
        const concertId =
          BigInt(dto.concertId);

        const ticketCategoryId =
          BigInt(dto.ticketCategoryId);

        const ticketCategory =
          await tx.ticketCategory.findUnique({
            where: {
              id: ticketCategoryId,
            },

            include: {
              concert: {
                select: {
                  id: true,
                  status: true,
                  startsAt: true,
                },
              },
            },
          });

        if (!ticketCategory) {
          throw new AppException(
            ErrorCode.TICKET_CATEGORY_NOT_FOUND,
            'Ticket category was not found.',
            HttpStatus.NOT_FOUND,
          );
        }

        if (
          ticketCategory.concertId !==
          concertId
        ) {
          throw new AppException(
            ErrorCode.TICKET_CATEGORY_NOT_IN_CONCERT,
            'Ticket category does not belong to the requested concert.',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (
          ticketCategory.concert
            .status !== 'PUBLISHED'
        ) {
          throw new AppException(
            ErrorCode.CONCERT_NOT_PUBLISHED,
            'Concert is not published.',
            HttpStatus.CONFLICT,
          );
        }

        if (
          ticketCategory.concert.startsAt <=
          new Date()
        ) {
          throw new AppException(
            ErrorCode.CONCERT_NOT_PUBLISHED,
            'Concert has already started and is no longer accepting bookings.',
            HttpStatus.CONFLICT,
          );
        }

        /*
         * 3. Atomic ticket decrement.
         */
        const inventoryResult =
          await tx.ticketCategory.updateMany({
            where: {
              id: ticketCategoryId,
              concertId,

              availableQuantity: {
                gte: dto.quantity,
              },
            },

            data: {
              availableQuantity: {
                decrement: dto.quantity,
              },
            },
          });

        if (
          inventoryResult.count !== 1
        ) {
          throw new AppException(
            ErrorCode.INSUFFICIENT_TICKET_INVENTORY,
            'Not enough ticket inventory is available.',
            HttpStatus.CONFLICT,
          );
        }

        /*
         * Money is always Decimal.
         */
        const subtotal =
          ticketCategory.price.mul(
            dto.quantity,
          );

        let discountAmount =
          subtotal.mul(0);

        let appliedVoucherId:
          | bigint
          | null = null;

        /*
         * 4. Voucher processing.
         */
        if (voucherCode) {
          const voucher =
            await tx.voucher.findUnique({
              where: {
                code: voucherCode,
              },
            });

          if (!voucher) {
            throw new AppException(
              ErrorCode.VOUCHER_NOT_FOUND,
              'Voucher was not found.',
              HttpStatus.NOT_FOUND,
            );
          }

          const now = new Date();

          if (
            voucher.status !== 'ACTIVE'
          ) {
            throw new AppException(
              ErrorCode.VOUCHER_INACTIVE,
              'Voucher is inactive.',
              HttpStatus.CONFLICT,
            );
          }

          if (now < voucher.startsAt) {
            throw new AppException(
              ErrorCode.VOUCHER_NOT_STARTED,
              'Voucher is not active yet.',
              HttpStatus.CONFLICT,
            );
          }

          if (now >= voucher.endsAt) {
            throw new AppException(
              ErrorCode.VOUCHER_EXPIRED,
              'Voucher has expired.',
              HttpStatus.CONFLICT,
            );
          }

          if (
            voucher.usedCount >=
            voucher.usageLimit
          ) {
            throw new AppException(
              ErrorCode.VOUCHER_USAGE_LIMIT_REACHED,
              'Voucher usage limit has been reached.',
              HttpStatus.CONFLICT,
            );
          }

          /*
           * Friendly early check.
           *
           * UNIQUE(voucher_id, user_id)
           * remains the final concurrency protection.
           */
          const previousRedemption =
            await tx.voucherRedemption.findFirst({
              where: {
                voucherId: voucher.id,
                userId,
              },

              select: {
                id: true,
              },
            });

          if (previousRedemption) {
            throw new AppException(
              ErrorCode.VOUCHER_ALREADY_USED,
              'This voucher has already been used by this user.',
              HttpStatus.CONFLICT,
            );
          }

          /*
           * 5. Atomic quota update.
           *
           * Final correctness does not depend
           * on the earlier usedCount read.
           */
          const voucherQuotaResult =
            await tx.$executeRaw`
              UPDATE vouchers
              SET
                used_count = used_count + 1,
                updated_at = NOW(3)
              WHERE id = ${voucher.id}
                AND status = 'ACTIVE'
                AND starts_at <= NOW(3)
                AND ends_at > NOW(3)
                AND used_count < usage_limit
            `;

          if (
            voucherQuotaResult !== 1
          ) {
            throw new AppException(
              ErrorCode.VOUCHER_USAGE_LIMIT_REACHED,
              'Voucher is no longer available.',
              HttpStatus.CONFLICT,
            );
          }

          appliedVoucherId =
            voucher.id;

          discountAmount =
            this.calculateDiscount(
              subtotal,
              voucher.discountType,
              voucher.discountValue,
            );
        }

        const totalAmount =
          subtotal.minus(
            discountAmount,
          );

        /*
         * 6. Create booking.
         */
        const booking =
          await tx.booking.create({
            data: {
              userId,
              concertId,
              ticketCategoryId,

              quantity:
                dto.quantity,

              unitPrice:
                ticketCategory.price,

              subtotal,

              discountAmount,

              totalAmount,

              status:
                'PENDING_PAYMENT',

              expiresAt: null,
            },
          });

        /*
         * 7. Persist voucher redemption.
         */
        if (
          appliedVoucherId !== null
        ) {
          try {
            await tx.voucherRedemption.create({
              data: {
                voucherId:
                  appliedVoucherId,

                userId,

                bookingId:
                  booking.id,

                discountAmount,
              },
            });
          } catch (error: unknown) {
            /*
             * Race example:
             * same user sends two different
             * booking requests using GEEK10.
             *
             * UNIQUE(voucher_id, user_id)
             * is the database authority.
             */
            if (
              error instanceof
                Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              throw new AppException(
                ErrorCode.VOUCHER_ALREADY_USED,
                'This voucher has already been used by this user.',
                HttpStatus.CONFLICT,
              );
            }

            throw error;
          }
        }

        /*
         * 8. Status history.
         */
        await tx.bookingStatusHistory.create({
          data: {
            bookingId:
              booking.id,

            fromStatus: null,

            toStatus:
              'PENDING_PAYMENT',

            changedByUserId:
              userId,

            reason:
              'Booking created.',
          },
        });

        /*
         * 9. Finish idempotency record.
         */
        await tx.idempotencyKey.update({
          where: {
            id: idempotency.id,
          },

          data: {
            status: 'COMPLETED',
            bookingId:
              booking.id,
          },
        });

        return this.toResponse(
          booking,
          voucherCode,
        );
      },
      {
        maxWait: 10000, // 10s max wait to acquire connection
        timeout: 20000, // 20s max transaction execution time
      },
      ),
    );
  }

  private async runWithDeadlockRetry(
    userId: bigint,
    key: string,
    fn: () => Promise<BookingResponseDto>,
  ): Promise<BookingResponseDto> {
    let attempt = 0;

    while (true) {
      try {
        return await fn();
      } catch (error: unknown) {
        const isDeadlock =
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';

        if (
          !isDeadlock ||
          attempt >= MAX_DEADLOCK_RETRIES
        ) {
          throw error;
        }

        attempt++;

        const jitter =
          Math.floor(
            Math.random() * 100,
          );

        const delay =
          50 * Math.pow(2, attempt - 1) +
          jitter;

        this.logger.warn(
          `Deadlock detected for userId=${userId} key=${key}, ` +
            `retry attempt ${attempt}/${MAX_DEADLOCK_RETRIES} ` +
            `after ${delay}ms`,
        );

        await new Promise<void>((resolve) =>
          setTimeout(resolve, delay),
        );
      }
    }
  }

  private normalizeVoucherCode(
    voucherCode: string | undefined,
  ): string | null {
    return normalizeVoucherCode(voucherCode);
  }

  private createRequestHash(
    dto: CreateBookingDto,
    voucherCode: string | null,
  ): string {
    const canonical: CanonicalBookingRequest = {
      concertId: dto.concertId,
      ticketCategoryId: dto.ticketCategoryId,
      quantity: dto.quantity,
      voucherCode,
    };
    return canonicalizeHash(canonical);
  }

  private calculateDiscount(
    subtotal: Prisma.Decimal,
    discountType: string,
    discountValue: Prisma.Decimal,
  ): Prisma.Decimal {
    return calculateDiscount(subtotal, discountType, discountValue);
  }

  private toResponse(
    booking: {
      id: bigint;
      userId: bigint;
      concertId: bigint;
      ticketCategoryId: bigint;
      quantity: number;

      unitPrice: {
        toFixed(
          decimalPlaces?: number,
        ): string;
      };

      subtotal: {
        toFixed(
          decimalPlaces?: number,
        ): string;
      };

      discountAmount: {
        toFixed(
          decimalPlaces?: number,
        ): string;
      };

      totalAmount: {
        toFixed(
          decimalPlaces?: number,
        ): string;
      };

      status: string;
      expiresAt: Date | null;
      createdAt: Date;
    },

    voucherCode: string | null,
  ): BookingResponseDto {
    return {
      id:
        booking.id.toString(),

      userId:
        booking.userId.toString(),

      concertId:
        booking.concertId.toString(),

      ticketCategoryId:
        booking.ticketCategoryId.toString(),

      voucherCode,

      quantity:
        booking.quantity,

      unitPrice:
        booking.unitPrice.toFixed(
          2,
        ),

      subtotal:
        booking.subtotal.toFixed(
          2,
        ),

      discountAmount:
        booking.discountAmount.toFixed(
          2,
        ),

      totalAmount:
        booking.totalAmount.toFixed(
          2,
        ),

      status:
        booking.status,

      expiresAt:
        booking.expiresAt?.toISOString() ??
        null,

      createdAt:
        booking.createdAt.toISOString(),
    };
  }

  async findOneForUser(
    userId: bigint,
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const booking =
      await this.prisma.booking.findFirst({
        where: {
          id: BigInt(bookingId),
          userId,
        },

        include:
          this.bookingVoucherInclude,
      });

    if (!booking) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_FOUND,
        'Booking was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.toResponse(
      booking,
      booking.voucherRedemption
        ?.voucher.code ?? null,
    );
  }

  async findMyBookings(
    userId: bigint,
    query: BookingListQueryDto,
  ): Promise<BookingListResponseDto> {
    const limit =
      query.limit ?? 20;

    const bookings =
      await this.prisma.booking.findMany({
        where: {
          userId,
        },

        include:
          this.bookingVoucherInclude,

        orderBy: {
          id: 'desc',
        },

        take: limit + 1,

        ...(query.cursor
          ? {
              cursor: {
                id: BigInt(
                  query.cursor,
                ),
              },
              skip: 1,
            }
          : {}),
      });

    const hasMore =
      bookings.length > limit;

    const page = hasMore
      ? bookings.slice(0, limit)
      : bookings;

    return {
      items: page.map((booking) =>
        this.toResponse(
          booking,
          booking.voucherRedemption
            ?.voucher.code ?? null,
        ),
      ),

      nextCursor:
        hasMore &&
        page.length > 0
          ? page[
              page.length - 1
            ].id.toString()
          : null,
    };
  }

  async findBookingsForOperations(
    query: OperationsBookingListQueryDto,
  ): Promise<BookingListResponseDto> {
    const limit =
      query.limit ?? 20;

    const bookings =
      await this.prisma.booking.findMany({
        where: {
          ...(query.concertId
            ? {
                concertId:
                  BigInt(
                    query.concertId,
                  ),
              }
            : {}),

          ...(query.status
            ? {
                status:
                  query.status as
                    | 'PENDING_PAYMENT'
                    | 'CONFIRMED'
                    | 'CANCELLED'
                    | 'EXPIRED',
              }
            : {}),
        },

        include:
          this.bookingVoucherInclude,

        orderBy: {
          id: 'desc',
        },

        take: limit + 1,

        ...(query.cursor
          ? {
              cursor: {
                id: BigInt(
                  query.cursor,
                ),
              },
              skip: 1,
            }
          : {}),
      });

    const hasMore =
      bookings.length > limit;

    const page = hasMore
      ? bookings.slice(0, limit)
      : bookings;

    return {
      items: page.map((booking) =>
        this.toResponse(
          booking,
          booking.voucherRedemption
            ?.voucher.code ?? null,
        ),
      ),

      nextCursor:
        hasMore &&
        page.length > 0
          ? page[
              page.length - 1
            ].id.toString()
          : null,
    };
  }

  async findOneForOperations(
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const booking =
      await this.prisma.booking.findUnique({
        where: {
          id: BigInt(bookingId),
        },

        include:
          this.bookingVoucherInclude,
      });

    if (!booking) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_FOUND,
        'Booking was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.toResponse(
      booking,
      booking.voucherRedemption
        ?.voucher.code ?? null,
    );
  }

  private defaultStatusReason(
    status:
      | 'CONFIRMED'
      | 'CANCELLED'
      | 'EXPIRED',
  ): string {
    switch (status) {
      case 'CONFIRMED':
        return 'Booking confirmed by operations.';

      case 'CANCELLED':
        return 'Booking cancelled by operations.';

      case 'EXPIRED':
        return 'Booking marked as expired by operations.';
    }
  }

  async updateStatusForOperations(
    operatorUserId: bigint,
    bookingId: string,
    dto: UpdateBookingStatusDto,
  ): Promise<BookingResponseDto> {
    const id = BigInt(bookingId);

    return this.prisma.$transaction(
      async (tx) => {
        /*
         * Lock the booking row first.
         *
         * Concurrent status changes for the same
         * booking are serialized here.
         */
        const rows =
          await tx.$queryRaw<
            LockedBookingRow[]
          >`
            SELECT
              id,
              ticket_category_id,
              quantity,
              status
            FROM bookings
            WHERE id = ${id}
            FOR UPDATE
          `;

        const lockedBooking =
          rows[0];

        if (!lockedBooking) {
          throw new AppException(
            ErrorCode.BOOKING_NOT_FOUND,
            'Booking was not found.',
            HttpStatus.NOT_FOUND,
          );
        }

        /*
         * Same desired terminal state is naturally
         * idempotent.
         *
         * Example:
         * CANCELLED -> CANCELLED
         *
         * Do not create another history row.
         * Do not restore inventory again.
         */
        if (
          lockedBooking.status ===
          dto.status
        ) {
          const existing =
            await tx.booking.findUniqueOrThrow({
              where: {
                id,
              },

              include:
                this.bookingVoucherInclude,
            });

          return this.toResponse(
            existing,
            existing.voucherRedemption
              ?.voucher.code ?? null,
          );
        }

        /*
         * Only PENDING_PAYMENT may transition.
         */
        if (
          lockedBooking.status !==
          'PENDING_PAYMENT'
        ) {
          throw new AppException(
            ErrorCode.INVALID_BOOKING_STATUS_TRANSITION,
            `Cannot change booking status from ${lockedBooking.status} to ${dto.status}.`,
            HttpStatus.CONFLICT,
          );
        }

        /*
         * CANCELLED and EXPIRED release reserved
         * ticket inventory.
         *
         * Because the booking row is locked,
         * only the transaction that performs the
         * first state transition can reach this block.
         */
        if (
          dto.status === 'CANCELLED' ||
          dto.status === 'EXPIRED'
        ) {
          await tx.ticketCategory.update({
            where: {
              id:
                lockedBooking.ticket_category_id,
            },

            data: {
              availableQuantity: {
                increment: Number(
                  lockedBooking.quantity,
                ),
              },
            },
          });
        }

        const updatedBooking =
          await tx.booking.update({
            where: {
              id,
            },

            data: {
              status:
                dto.status,
            },

            include:
              this.bookingVoucherInclude,
          });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId:
              id,

            fromStatus:
              lockedBooking.status,

            toStatus:
              dto.status,

            changedByUserId:
              operatorUserId,

            reason:
              dto.reason?.trim() ||
              this.defaultStatusReason(
                dto.status,
              ),
          },
        });

        return this.toResponse(
          updatedBooking,
          updatedBooking
            .voucherRedemption
            ?.voucher.code ?? null,
        );
      },
    );
  }
}