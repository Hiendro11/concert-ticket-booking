import {
  assert,
  BASE_URL,
  createTestPrisma,
  postBooking,
} from './helpers';

const prisma =
  createTestPrisma();

interface StatusResponse {
  id?: string;
  status?: string;
  code?: string;
}

async function cancelBooking(
  bookingId: string,
): Promise<{
  status: number;
  body: StatusResponse;
}> {
  const response =
    await fetch(
      `${BASE_URL}/api/v1/ops/bookings/${bookingId}/status`,
      {
        method: 'PATCH',

        headers: {
          'Content-Type':
            'application/json',

          'X-User-Id':
            '1001',
        },

        body: JSON.stringify({
          status: 'CANCELLED',
        }),
      },
    );

  return {
    status:
      response.status,

    body:
      (await response.json()) as
        StatusResponse,
  };
}

async function main(): Promise<void> {
  console.log(
    'Creating a booking for 2 VIP tickets...',
  );

  const createResult =
    await postBooking(
      '2001',
      'cancel-race-booking-001',
      {
        concertId: '3001',
        ticketCategoryId:
          '4001',
        quantity: 2,
      },
    );

  assert(
    createResult.status === 201,
    `Expected booking creation 201, got ${createResult.status}`,
  );

  assert(
    typeof createResult.body.id ===
      'string',
    'Booking response must contain id.',
  );

  const bookingId =
    createResult.body.id;

  let category =
    await prisma.ticketCategory
      .findUniqueOrThrow({
        where: {
          id: 4001n,
        },
      });

  assert(
    category.availableQuantity ===
      18,
    `Expected inventory 18 after booking, got ${category.availableQuantity}`,
  );

  console.log(
    'Sending 10 concurrent CANCELLED requests...',
  );

  const results =
    await Promise.all(
      Array.from(
        { length: 10 },
        () =>
          cancelBooking(
            bookingId,
          ),
      ),
    );

  const successCount =
    results.filter(
      (result) =>
        result.status === 200,
    ).length;

  const unexpected =
    results.filter(
      (result) =>
        result.status !== 200,
    );

  if (
    unexpected.length > 0
  ) {
    console.dir(
      unexpected,
      {
        depth: 10,
      },
    );
  }

  assert(
    successCount === 10,
    `Expected all 10 identical status requests to be idempotently successful, got ${successCount}`,
  );

  category =
    await prisma.ticketCategory
      .findUniqueOrThrow({
        where: {
          id: 4001n,
        },
      });

  const booking =
    await prisma.booking
      .findUniqueOrThrow({
        where: {
          id:
            BigInt(
              bookingId,
            ),
        },
      });

  const cancellationHistoryCount =
    await prisma
      .bookingStatusHistory
      .count({
        where: {
          bookingId:
            booking.id,

          fromStatus:
            'PENDING_PAYMENT',

          toStatus:
            'CANCELLED',
        },
      });

  assert(
    booking.status ===
      'CANCELLED',
    `Expected booking CANCELLED, got ${booking.status}`,
  );

  assert(
    category.availableQuantity ===
      20,
    `Expected inventory restored exactly to 20, got ${category.availableQuantity}`,
  );

  assert(
    cancellationHistoryCount ===
      1,
    `Expected exactly one cancellation transition history, got ${cancellationHistoryCount}`,
  );

  console.log('');
  console.log(
    'PASS: cancellation is idempotent under concurrency.',
  );

  console.log(
    `Successful responses: ${successCount}`,
  );

  console.log(
    `Final inventory: ${category.availableQuantity}`,
  );

  console.log(
    `Cancellation transitions: ${cancellationHistoryCount}`,
  );
}

main()
  .catch(
    (error: unknown) => {
      console.error('');
      console.error(
        'FAIL: cancellation concurrency test',
      );

      console.error(error);

      process.exitCode = 1;
    },
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    },
  );
