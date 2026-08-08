import {
  assert,
  createTestPrisma,
  postBooking,
} from './helpers';

const prisma =
  createTestPrisma();

async function main(): Promise<void> {
  const users =
    Array.from(
      {
        length: 10,
      },

      (_, index) =>
        String(
          2101 + index,
        ),
    );

  console.log(
    'Sending 10 concurrent FLASH50K bookings...',
  );

  const results =
    await Promise.all(
      users.map(
        (
          userId,
          index,
        ) =>
          postBooking(
            userId,
            `voucher-quota-race-${index + 1}`,
            {
              concertId:
                '3001',

              ticketCategoryId:
                '4002',

              quantity: 1,

              voucherCode:
                'FLASH50K',
            },
          ),
      ),
    );

  const successes =
    results.filter(
      (result) =>
        result.status === 201,
    );

  const quotaFailures =
    results.filter(
      (result) =>
        result.status === 409 &&
        result.body.code ===
          'VOUCHER_USAGE_LIMIT_REACHED',
    );

  const unexpected =
    results.filter(
      (result) =>
        result.status !== 201 &&
        !(
          result.status === 409 &&
          result.body.code ===
            'VOUCHER_USAGE_LIMIT_REACHED'
        ),
    );

  console.log(
    `Success: ${successes.length}`,
  );

  console.log(
    `Quota rejected: ${quotaFailures.length}`,
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
    successes.length === 5,
    `Expected exactly 5 successful voucher bookings, got ${successes.length}`,
  );

  assert(
    quotaFailures.length ===
      5,
    `Expected exactly 5 quota failures, got ${quotaFailures.length}`,
  );

  assert(
    unexpected.length === 0,
    `Expected no unexpected failures, got ${unexpected.length}`,
  );

  const voucher =
    await prisma.voucher.findUniqueOrThrow({
      where: {
        code: 'FLASH50K',
      },
    });

  const redemptions =
    await prisma.voucherRedemption.count({
      where: {
        voucherId:
          voucher.id,
      },
    });

  const standard =
    await prisma.ticketCategory.findUniqueOrThrow({
      where: {
        id: 4002n,
      },
    });

  const bookingCount =
    await prisma.booking.count({
      where: {
        ticketCategoryId:
          4002n,
      },
    });

  assert(
    voucher.usedCount === 5,
    `Expected used_count=5, got ${voucher.usedCount}`,
  );

  assert(
    redemptions === 5,
    `Expected 5 voucher redemptions, got ${redemptions}`,
  );

  assert(
    bookingCount === 5,
    `Expected 5 committed bookings, got ${bookingCount}`,
  );

  assert(
    standard.availableQuantity ===
      95,
    `Expected Standard inventory=95, got ${standard.availableQuantity}`,
  );

  console.log('');
  console.log(
    'PASS: voucher quota protected under concurrency.',
  );

  console.log(
    `Voucher used_count: ${voucher.usedCount}`,
  );

  console.log(
    `Redemptions: ${redemptions}`,
  );

  console.log(
    `Final Standard inventory: ${standard.availableQuantity}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('');
    console.error(
      'FAIL: voucher quota concurrency test',
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });