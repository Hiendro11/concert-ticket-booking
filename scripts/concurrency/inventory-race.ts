import {
  assert,
  createTestPrisma,
  postBooking,
} from './helpers';

const prisma =
  createTestPrisma();

async function main(): Promise<void> {
  const requestCount = 50;

  console.log(
    `Sending ${requestCount} concurrent booking requests...`,
  );

  const results =
    await Promise.all(
      Array.from(
        {
          length:
            requestCount,
        },

        (_, index) =>
          postBooking(
            '2001',
            `inventory-race-${index + 1}`,
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

  const successes =
    results.filter(
      (result) =>
        result.status === 201,
    );

  const inventoryFailures =
    results.filter(
      (result) =>
        result.status === 409 &&
        result.body.code ===
          'INSUFFICIENT_TICKET_INVENTORY',
    );

  const unexpected =
    results.filter(
      (result) =>
        result.status !== 201 &&
        !(
          result.status === 409 &&
          result.body.code ===
            'INSUFFICIENT_TICKET_INVENTORY'
        ),
    );

  console.log(
    `Success: ${successes.length}`,
  );

  console.log(
    `Inventory rejected: ${inventoryFailures.length}`,
  );

  console.log(
    `Unexpected: ${unexpected.length}`,
  );

  if (unexpected.length > 0) {
    console.dir(
      unexpected,
      {
        depth: 10,
      },
    );
  }

  assert(
    successes.length === 20,
    `Expected 20 successful bookings, got ${successes.length}`,
  );

  assert(
    inventoryFailures.length === 30,
    `Expected 30 inventory failures, got ${inventoryFailures.length}`,
  );

  assert(
    unexpected.length === 0,
    `Expected no unexpected failures, got ${unexpected.length}`,
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
        ticketCategoryId:
          4001n,
      },
    });

  assert(
    category.availableQuantity ===
      0,
    `Expected available inventory 0, got ${category.availableQuantity}`,
  );

  assert(
    bookingCount === 20,
    `Expected exactly 20 bookings, got ${bookingCount}`,
  );

  console.log('');
  console.log(
    'PASS: no overselling detected.',
  );
  console.log(
    `Final inventory: ${category.availableQuantity}`,
  );
  console.log(
    `Bookings created: ${bookingCount}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('');
    console.error(
      'FAIL: inventory concurrency test',
    );
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });