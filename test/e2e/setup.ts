/**
 * E2E Test Seed
 *
 * Resets the database to a known deterministic state before the e2e suite.
 * Run via: tsx test/e2e/setup.ts
 * (Called automatically by `npm run test:e2e`)
 */
import 'dotenv/config';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../src/generated/prisma/client';

export default async function setup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for e2e tests.');
  }

  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));

  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: 5,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    // Reset data in FK-safe order
    await prisma.bookingStatusHistory.deleteMany();
    await prisma.voucherRedemption.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.ticketCategory.deleteMany();
    await prisma.voucher.deleteMany();
    await prisma.concert.deleteMany();
    await prisma.user.deleteMany();

    // ── Users ────────────────────────────────────────────────
    await prisma.user.createMany({
      data: [
        { id: 1001n, email: 'operator@concert.local',      name: 'Launch Operations', role: 'OPERATOR' },
        { id: 2001n, email: 'customer.one@concert.local',  name: 'Customer One',      role: 'CUSTOMER' },
        { id: 2002n, email: 'customer.two@concert.local',  name: 'Customer Two',      role: 'CUSTOMER' },
        { id: 2003n, email: 'customer.three@concert.local',name: 'Customer Three',    role: 'CUSTOMER' },
        ...Array.from({ length: 10 }, (_, i) => ({
          id: BigInt(2101 + i),
          email: `load.customer.${i + 1}@concert.local`,
          name: `Load Customer ${String(i + 1).padStart(2, '0')}`,
          role: 'CUSTOMER' as const,
        })),
      ],
    });

    // ── Concerts ─────────────────────────────────────────────
    await prisma.concert.createMany({
      data: [
        {
          id: 3001n,
          name: 'Neon Pulse Live 2026',
          venue: 'Saigon Exhibition & Convention Center, Ho Chi Minh City',
          description: 'High-demand concert fixture for flash-sale booking tests.',
          startsAt: new Date('2026-09-20T12:00:00.000Z'),
          status: 'PUBLISHED',
          publishedAt: new Date('2026-08-08T09:00:00.000Z'),
        },
        {
          id: 3002n,
          name: 'Indie Skyline Sessions 2026',
          venue: 'Youth Cultural House, Ho Chi Minh City',
          description: 'Draft concert fixture for unpublished-booking rejection tests.',
          startsAt: new Date('2026-10-18T12:00:00.000Z'),
          status: 'DRAFT',
          publishedAt: null,
        },
      ],
    });

    // ── Ticket categories ────────────────────────────────────
    await prisma.ticketCategory.createMany({
      data: [
        { id: 4001n, concertId: 3001n, name: 'VIP',              price: '2000000.00', totalQuantity: 20,  availableQuantity: 20  },
        { id: 4002n, concertId: 3001n, name: 'Standard',         price: '800000.00',  totalQuantity: 100, availableQuantity: 100 },
        { id: 4003n, concertId: 3002n, name: 'General Admission', price: '650000.00', totalQuantity: 80,  availableQuantity: 80  },
      ],
    });

    // ── Vouchers ─────────────────────────────────────────────
    await prisma.voucher.createMany({
      data: [
        {
          id: 5001n,
          code: 'GEEK10',
          discountType: 'PERCENTAGE',
          discountValue: '10.00',
          usageLimit: 10,
          usedCount: 0,
          status: 'ACTIVE',
          startsAt: new Date('2026-08-01T00:00:00.000Z'),
          endsAt: new Date('2026-10-01T00:00:00.000Z'),
        },
        {
          id: 5002n,
          code: 'FLASH50K',
          discountType: 'FIXED_AMOUNT',
          discountValue: '50000.00',
          usageLimit: 5,
          usedCount: 0,
          status: 'ACTIVE',
          startsAt: new Date('2026-08-01T00:00:00.000Z'),
          endsAt: new Date('2026-09-30T23:59:59.000Z'),
        },
        {
          id: 5003n,
          code: 'EXPIRED10',
          discountType: 'PERCENTAGE',
          discountValue: '10.00',
          usageLimit: 100,
          usedCount: 0,
          status: 'ACTIVE',
          startsAt: new Date('2026-07-01T00:00:00.000Z'),
          endsAt: new Date('2026-08-01T00:00:00.000Z'),  // already expired
        },
      ],
    });

    console.log('[e2e setup] Database reset and seed complete.');
  } finally {
    await prisma.$disconnect();
  }
}

// Run directly via tsx
setup().catch((err: unknown) => {
  console.error('[e2e setup] Failed:', err);
  process.exit(1);
});
