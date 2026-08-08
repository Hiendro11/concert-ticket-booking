import 'dotenv/config';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../src/generated/prisma/client';

export const BASE_URL =
  process.env.API_BASE_URL ??
  'http://localhost:3000';

export interface BookingRequestBody {
  concertId: string;
  ticketCategoryId: string;
  quantity: number;
  voucherCode?: string;
}

export interface BookingApiBody {
  id?: string;
  code?: string;
  message?: string;
  status?: string;
}

export interface ApiResult {
  status: number;
  body: BookingApiBody;
}

export function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `Assertion failed: ${message}`,
    );
  }
}

export async function postBooking(
  userId: string,
  idempotencyKey: string,
  body: BookingRequestBody,
): Promise<ApiResult> {
  const response = await fetch(
    `${BASE_URL}/api/v1/bookings`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',

        'X-User-Id':
          userId,

        'Idempotency-Key':
          idempotencyKey,
      },

      body: JSON.stringify(body),
    },
  );

  const responseBody =
    (await response.json()) as BookingApiBody;

  return {
    status: response.status,
    body: responseBody,
  };
}

export function createTestPrisma(): PrismaClient {
  const databaseUrl =
    process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required.',
    );
  }

  const url =
    new URL(databaseUrl);

  const adapter =
    new PrismaMariaDb({
      host:
        url.hostname,

      port:
        Number(
          url.port || 3306,
        ),

      user:
        decodeURIComponent(
          url.username,
        ),

      password:
        decodeURIComponent(
          url.password,
        ),

      database:
        decodeURIComponent(
          url.pathname.replace(
            /^\//,
            '',
          ),
        ),

      connectionLimit: 2,
    });

  return new PrismaClient({
    adapter,
  });
}