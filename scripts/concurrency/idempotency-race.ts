import {
  assert,
  createTestPrisma,
  postBooking,
} from './helpers';

const prisma =
  createTestPrisma();

async function main(): Promise<void> {
  const requestCount = 10;

  const sharedKey =
    'same-request-race-001';

  console.log(
    `Sending ${requestCount} concurrent retries with the same Idempotency-Key...`,
  );

  const results =
    await Promise.all(
      Array.from(
        {
          length:
            requestCount,
        },

        () =>
          postBooking(
            '2001',
            sharedKey,
            {
              concertId:
                '3001',

              ticketCategoryId:
                '4001',

              quantity: 1,
            },
          ),
      ),
    );

  const failures =
    results.filter(
      (result) =>
        result.status !== 201,
    );

  if (failures.length > 0) {
    console.dir(
      failures,
      {
        depth: 10,
      },
    );
  }

  assert(
    failures.length === 0,
    `Expected all retries to succeed logically, got ${failures.length} failures`,
  );

  const bookingIds =
    results
      .map(
        (result) =>
          result.body.id,
      )
      .filter(
        (
          id,
        ): id is string =>
          typeof id ===
          'string',
      );

  const uniqueBookingIds =
    new Set(
      bookingIds,
    );

  assert(
    bookingIds.length ===
      requestCount,
    'Every successful response must contain a booking id.',
  );

  assert(
    uniqueBookingIds.size ===
      1,
    `Expected exactly one logical booking ID, got ${uniqueBookingIds.size}`,
  );

  const category =
    await prisma.ticketCategory.findUniqueOrThrow({
      where: {
        id: 4001n,
      },
    });

  const bookingCount =
    await prisma.booking.count({
      where: {
        userId: 2001n,
        ticketCategoryId:
          4001n,
      },
    });

  const idempotencyCount =
    await prisma.idempotencyKey.count({
      where: {
        userId: 2001n,
        idempotencyKey:
          sharedKey,
      },
    });

  assert(
    category.availableQuantity ===
      19,
    `Expected inventory 19, got ${category.availableQuantity}`,
  );

  assert(
    bookingCount === 1,
    `Expected one booking row, got ${bookingCount}`,
  );

  assert(
    idempotencyCount === 1,
    `Expected one idempotency row, got ${idempotencyCount}`,
  );

  console.log('');
  console.log(
    'PASS: concurrent retries produced one logical booking.',
  );

  console.log(
    `Booking ID: ${[...uniqueBookingIds][0]}`,
  );

  console.log(
    `Final inventory: ${category.availableQuantity}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('');
    console.error(
      'FAIL: idempotency concurrency test',
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });