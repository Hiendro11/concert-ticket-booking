import 'dotenv/config';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const url = new URL(databaseUrl);

const database = decodeURIComponent(
  url.pathname.replace(/^\//, ''),
);

if (!database) {
  throw new Error(
    'DATABASE_URL must include a database name.',
  );
}

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
  connectionLimit: 5,
});

const prisma = new PrismaClient({
  adapter,
});

const ids = {
  operator: 1001n,

  customer1: 2001n,
  customer2: 2002n,
  customer3: 2003n,

  publishedConcert: 3001n,
  draftConcert: 3002n,

  vip: 4001n,
  standard: 4002n,
  draftGeneral: 4003n,

  geek10: 5001n,
  flash50k: 5002n,
  expired10: 5003n,
} as const;

/**
 * Generate a date relative to now so the seed never contains stale
 * hardcoded dates that silently break tests after those dates pass.
 */
function relativeDate(offsetDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

const loadTestUsers = Array.from(
  { length: 10 },
  (_, index) => ({
    id: BigInt(2101 + index),

    email:
      `load.customer.${index + 1}@concert.local`,

    name:
      `Load Customer ${String(index + 1).padStart(2, '0')}`,

    role: 'CUSTOMER' as const,
  }),
);

async function resetDevelopmentData(): Promise<void> {
  /*
   * Delete data in foreign-key-safe order.
   *
   * Running the seed repeatedly always restores
   * the same deterministic development state.
   */

  await prisma.bookingStatusHistory.deleteMany();

  await prisma.voucherRedemption.deleteMany();

  await prisma.idempotencyKey.deleteMany();

  await prisma.booking.deleteMany();

  await prisma.ticketCategory.deleteMany();

  await prisma.voucher.deleteMany();

  await prisma.concert.deleteMany();

  await prisma.user.deleteMany();
}

async function seedUsers(): Promise<void> {
  await prisma.user.createMany({
    data: [
      {
        id: ids.operator,
        email: 'operator@concert.local',
        name: 'Launch Operations',
        role: 'OPERATOR',
      },

      {
        id: ids.customer1,
        email: 'customer.one@concert.local',
        name: 'Customer One',
        role: 'CUSTOMER',
      },

      {
        id: ids.customer2,
        email: 'customer.two@concert.local',
        name: 'Customer Two',
        role: 'CUSTOMER',
      },

      {
        id: ids.customer3,
        email: 'customer.three@concert.local',
        name: 'Customer Three',
        role: 'CUSTOMER',
      },

      ...loadTestUsers,
    ],
  });
}

async function seedConcerts(): Promise<void> {
  await prisma.concert.createMany({
    data: [
      {
        id: ids.publishedConcert,

        name:
          'Neon Pulse Live 2026',

        venue:
          'Saigon Exhibition & Convention Center, Ho Chi Minh City',

        description:
          'High-demand concert fixture for flash-sale booking tests.',

        startsAt:
          relativeDate(60), // 60 days from now — always in the future

        status:
          'PUBLISHED',

        publishedAt:
          relativeDate(-30), // published 30 days ago
      },

      {
        id:
          ids.draftConcert,

        name:
          'Indie Skyline Sessions 2026',

        venue:
          'Youth Cultural House, Ho Chi Minh City',

        description:
          'Draft concert fixture for unpublished-booking rejection tests.',

        startsAt:
          relativeDate(90), // 90 days from now — always in the future

        status:
          'DRAFT',

        publishedAt:
          null,
      },
    ],
  });
}

async function seedTicketCategories(): Promise<void> {
  await prisma.ticketCategory.createMany({
    data: [
      {
        id:
          ids.vip,

        concertId:
          ids.publishedConcert,

        name:
          'VIP',

        price:
          '2000000.00',

        totalQuantity:
          20,

        availableQuantity:
          20,
      },

      {
        id:
          ids.standard,

        concertId:
          ids.publishedConcert,

        name:
          'Standard',

        price:
          '800000.00',

        totalQuantity:
          100,

        availableQuantity:
          100,
      },

      {
        id:
          ids.draftGeneral,

        concertId:
          ids.draftConcert,

        name:
          'General Admission',

        price:
          '650000.00',

        totalQuantity:
          80,

        availableQuantity:
          80,
      },
    ],
  });
}

async function seedVouchers(): Promise<void> {
  await prisma.voucher.createMany({
    data: [
      {
        id:
          ids.geek10,

        code:
          'GEEK10',

        discountType:
          'PERCENTAGE',

        discountValue:
          '10.00',

        usageLimit:
          10,

        usedCount:
          0,

        status:
          'ACTIVE',

        startsAt:
          relativeDate(-7), // started 7 days ago

        endsAt:
          relativeDate(180), // valid for 180 days from now
      },

      {
        id:
          ids.flash50k,

        code:
          'FLASH50K',

        discountType:
          'FIXED_AMOUNT',

        discountValue:
          '50000.00',

        usageLimit:
          5,

        usedCount:
          0,

        status:
          'ACTIVE',

        startsAt:
          relativeDate(-7), // started 7 days ago

        endsAt:
          relativeDate(180), // valid for 180 days from now
      },

      {
        id:
          ids.expired10,

        code:
          'EXPIRED10',

        discountType:
          'PERCENTAGE',

        discountValue:
          '10.00',

        usageLimit:
          100,

        usedCount:
          0,

        status:
          'ACTIVE',

        startsAt:
          relativeDate(-60), // started 60 days ago

        endsAt:
          relativeDate(-7), // expired 7 days ago — guaranteed expired fixture
      },
    ],
  });
}

function printSeedSummary(): void {
  console.log('');

  console.log(
    'Seed completed successfully.',
  );

  console.log('');

  console.log(
    'Test identities',
  );

  console.log(
    `  Operator:        X-User-Id=${ids.operator}`,
  );

  console.log(
    `  Customer #1:     X-User-Id=${ids.customer1}`,
  );

  console.log(
    `  Customer #2:     X-User-Id=${ids.customer2}`,
  );

  console.log(
    `  Customer #3:     X-User-Id=${ids.customer3}`,
  );

  console.log(
    '  Load-test users: X-User-Id=2101-2110',
  );

  console.log('');

  console.log(
    'Concerts',
  );

  console.log(
    `  Published: id=${ids.publishedConcert} - Neon Pulse Live 2026`,
  );

  console.log(
    `  Draft:     id=${ids.draftConcert} - Indie Skyline Sessions 2026`,
  );

  console.log('');

  console.log(
    'Ticket categories',
  );

  console.log(
    `  VIP:      id=${ids.vip}, price=2000000.00, inventory=20`,
  );

  console.log(
    `  Standard: id=${ids.standard}, price=800000.00, inventory=100`,
  );

  console.log(
    `  Draft GA: id=${ids.draftGeneral}, price=650000.00, inventory=80`,
  );

  console.log('');

  console.log(
    'Vouchers',
  );

  console.log(
    `  GEEK10:    id=${ids.geek10}, 10%, quota=10, active`,
  );

  console.log(
    `  FLASH50K:  id=${ids.flash50k}, fixed 50000.00, quota=5, active`,
  );

  console.log(
    `  EXPIRED10: id=${ids.expired10}, 10%, expired by time`,
  );

  console.log('');
}

async function main(): Promise<void> {
  if (
    process.env.NODE_ENV ===
    'production'
  ) {
    throw new Error(
      'Refusing to seed production. This seed resets development data.',
    );
  }

  console.log(
    'Resetting deterministic development seed data...',
  );

  await resetDevelopmentData();

  await seedUsers();

  await seedConcerts();

  await seedTicketCategories();

  await seedVouchers();

  printSeedSummary();
}

main()
  .catch(
    (error: unknown) => {
      console.error(
        'Seed failed.',
      );

      console.error(
        error,
      );

      process.exitCode = 1;
    },
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    },
  );