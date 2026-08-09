/**
 * Same-user Voucher Abuse Concurrency Test (T-04)
 *
 * Sends 10 concurrent booking requests from the SAME user,
 * all using the same one-time-per-user voucher (GEEK10).
 * Each request has a different idempotency key (simulating
 * distinct booking attempts, not retries).
 *
 * Expected invariants:
 *   - Exactly 1 successful redemption (201)
 *   - 9 VOUCHER_ALREADY_USED (409) rejections
 *   - voucher_redemptions table has exactly 1 row for this user
 *   - Inventory deducted exactly once
 */
import {
  assert,
  createTestPrisma,
  postBooking,
} from './helpers';

const prisma = createTestPrisma();

// GEEK10 voucher: 10% discount, usage_limit=100 (plenty of global quota)
// Customer 2001 has no prior redemption from seed
const USER_ID = '2001';
const VOUCHER_CODE = 'GEEK10';
const CONCURRENT_REQUESTS = 10;

async function main(): Promise<void> {
  console.log(
    `Sending ${CONCURRENT_REQUESTS} concurrent booking requests from user ${USER_ID} ` +
    `all using voucher ${VOUCHER_CODE}...`,
  );

  const results = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
      postBooking(
        USER_ID,
        `same-user-voucher-race-${index + 1}`,
        {
          concertId: '3001',
          ticketCategoryId: '4001', // VIP category
          quantity: 1,
          voucherCode: VOUCHER_CODE,
        },
      ),
    ),
  );

  const successes = results.filter((r) => r.status === 201);

  const alreadyUsed = results.filter(
    (r) =>
      r.status === 409 &&
      r.body.code === 'VOUCHER_ALREADY_USED',
  );

  const unexpected = results.filter(
    (r) =>
      r.status !== 201 &&
      !(r.status === 409 && r.body.code === 'VOUCHER_ALREADY_USED'),
  );

  console.log(`Success:           ${successes.length}`);
  console.log(`VOUCHER_ALREADY_USED: ${alreadyUsed.length}`);
  console.log(`Unexpected:        ${unexpected.length}`);

  if (unexpected.length > 0) {
    console.dir(unexpected, { depth: 10 });
  }

  assert(
    successes.length === 1,
    `Expected exactly 1 successful booking, got ${successes.length}`,
  );

  assert(
    alreadyUsed.length === CONCURRENT_REQUESTS - 1,
    `Expected ${CONCURRENT_REQUESTS - 1} VOUCHER_ALREADY_USED errors, got ${alreadyUsed.length}`,
  );

  assert(
    unexpected.length === 0,
    `Expected no unexpected failures, got ${unexpected.length}`,
  );

  // Verify DB invariants
  const voucher = await prisma.voucher.findUniqueOrThrow({
    where: { code: VOUCHER_CODE },
  });

  const redemptionsForUser = await prisma.voucherRedemption.count({
    where: {
      voucherId: voucher.id,
      userId: BigInt(USER_ID),
    },
  });

  const bookingsForUser = await prisma.booking.count({
    where: {
      userId: BigInt(USER_ID),
      ticketCategoryId: 4001n,
    },
  });

  const vipCategory = await prisma.ticketCategory.findUniqueOrThrow({
    where: { id: 4001n },
  });

  assert(
    redemptionsForUser === 1,
    `Expected exactly 1 voucher redemption for user ${USER_ID}, got ${redemptionsForUser}`,
  );

  assert(
    bookingsForUser === 1,
    `Expected exactly 1 booking for user ${USER_ID}, got ${bookingsForUser}`,
  );

  // Seed starts VIP at 20. One successful booking of quantity 1 => 19 remaining.
  assert(
    vipCategory.availableQuantity === 19,
    `Expected VIP inventory=19, got ${vipCategory.availableQuantity}`,
  );

  console.log('');
  console.log('PASS: per-user voucher abuse prevented under concurrency.');
  console.log(`Voucher redemptions for user ${USER_ID}: ${redemptionsForUser}`);
  console.log(`Bookings for user ${USER_ID}: ${bookingsForUser}`);
  console.log(`Final VIP inventory: ${vipCategory.availableQuantity}`);
}

main()
  .catch((error: unknown) => {
    console.error('');
    console.error('FAIL: same-user voucher abuse test');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
