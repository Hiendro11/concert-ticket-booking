import {
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';

import { createHash } from 'crypto';

import {
  Prisma,
} from '../../generated/prisma/client';

import { PrismaService } from '../../database/prisma/prisma.service';

import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';

import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';

interface IdempotencyRow {
  id: bigint;
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  booking_id: bigint | null;
}

const MAX_DEADLOCK_RETRIES = 5;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

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
    voucherCode:
      | string
      | undefined,
  ): string | null {
    if (!voucherCode) {
      return null;
    }

    return voucherCode
      .trim()
      .toUpperCase();
  }

  private createRequestHash(
    dto: CreateBookingDto,
    voucherCode: string | null,
  ): string {
    /*
     * Voucher MUST be part of the
     * idempotency request identity.
     */
    const canonicalRequest = {
      concertId: dto.concertId,

      ticketCategoryId:
        dto.ticketCategoryId,

      quantity: dto.quantity,

      voucherCode,
    };

    return createHash('sha256')
      .update(
        JSON.stringify(
          canonicalRequest,
        ),
      )
      .digest('hex');
  }

  private calculateDiscount(
    subtotal: Prisma.Decimal,

    discountType: string,

    discountValue:
      Prisma.Decimal,
  ): Prisma.Decimal {
    let discount:
      Prisma.Decimal;

    if (
      discountType ===
      'PERCENTAGE'
    ) {
      discount = subtotal
        .mul(discountValue)
        .div(100)
        .toDecimalPlaces(2);
    } else {
      discount =
        discountValue.toDecimalPlaces(
          2,
        );
    }

    /*
     * A fixed voucher must never make
     * totalAmount negative.
     */
    if (
      discount.greaterThan(
        subtotal,
      )
    ) {
      return subtotal;
    }

    return discount;
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
}