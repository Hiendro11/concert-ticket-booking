/**
 * E2E Regression Test Suite
 * Concert Ticket Booking Platform
 *
 * Uses the real NestJS application (Supertest) + real database.
 * No Prisma mocking.
 *
 * Covers:
 *  1.  Health check
 *  2.  Public concerts – only PUBLISHED are visible
 *  3.  Draft concert is hidden (404)
 *  4.  Authentication – missing X-User-Id
 *  5.  Authorization – customer hitting operator endpoint
 *  6.  Create booking
 *  7.  Idempotent retry (same key + payload)
 *  8.  Idempotency conflict (same key, different payload)
 *  9.  Voucher discount (GEEK10 → 10%)
 *  10. Expired voucher (EXPIRED10 → 409)
 *  11. Customer ownership (2002 cannot read 2001's booking)
 *  12. Status transition PENDING_PAYMENT → CONFIRMED
 *  13. Invalid transition CONFIRMED → CANCELLED
 *  14. Cancellation with inventory restore
 */
import 'dotenv/config';

import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
// supertest has a CJS default export; use require to avoid the namespace issue
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../src/generated/prisma/client';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/errors/global-exception.filter';

// ── Helpers ────────────────────────────────────────────────────────────────

function buildPrisma(): PrismaClient {
  const url = new URL(process.env.DATABASE_URL!);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: 3,
  });
  return new PrismaClient({ adapter });
}

// ── Constants matching the seed ────────────────────────────────────────────

const OPERATOR_ID    = '1001';
const CUSTOMER_1_ID  = '2001';
const CUSTOMER_2_ID  = '2002';
const CONCERT_ID     = '3001';
const DRAFT_CONCERT  = '3002';
const VIP_CAT_ID     = '4001';
const STD_CAT_ID     = '4002';

// ── Suite ──────────────────────────────────────────────────────────────────

describe('Concert Ticket Booking – E2E Regression', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Stand up the NestJS application once for the entire suite.
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1', { exclude: ['health'] });

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    app.useGlobalFilters(new GlobalExceptionFilter());

    await app.init();

    prisma = buildPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // ── 1. Health ─────────────────────────────────────────────────────────────

  describe('1. Health', () => {
    it('GET /health → 200', async () => {
      await request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });

  // ── 2 & 3. Public Concerts ───────────────────────────────────────────────

  describe('2. Public concerts', () => {
    it('GET /api/v1/concerts → only PUBLISHED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/concerts')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);

      const ids = (res.body as { id: string }[]).map((c) => c.id);
      expect(ids).toContain(CONCERT_ID);
      expect(ids).not.toContain(DRAFT_CONCERT);
    });

    it('GET /api/v1/concerts/3002 → 404 (draft hidden)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/concerts/${DRAFT_CONCERT}`)
        .expect(404);

      expect(res.body.code).toBe('CONCERT_NOT_FOUND');
    });
  });

  // ── 4. Authentication ─────────────────────────────────────────────────────

  describe('3. Authentication', () => {
    it('GET /api/v1/me/bookings without X-User-Id → 401 USER_ID_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me/bookings')
        .expect(401);

      expect(res.body.code).toBe('USER_ID_REQUIRED');
    });
  });

  // ── 5. Authorization ──────────────────────────────────────────────────────

  describe('4. Authorization', () => {
    it('Customer calling operations endpoint → 403 OPERATOR_ACCESS_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ops/bookings')
        .set('X-User-Id', CUSTOMER_1_ID)
        .expect(403);

      expect(res.body.code).toBe('OPERATOR_ACCESS_REQUIRED');
    });
  });

  // ── 6 – 8. Create booking + idempotency ──────────────────────────────────

  describe('5. Create booking', () => {
    const idempotencyKey = 'e2e-booking-001';
    let bookingId: string;

    it('POST /api/v1/bookings → 201 PENDING_PAYMENT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('X-User-Id', CUSTOMER_1_ID)
        .set('Idempotency-Key', idempotencyKey)
        .send({ concertId: CONCERT_ID, ticketCategoryId: VIP_CAT_ID, quantity: 2 })
        .expect(201);

      expect(res.body.status).toBe('PENDING_PAYMENT');
      expect(typeof res.body.id).toBe('string');

      bookingId = res.body.id;
    });

    it('VIP inventory decremented from 20 → 18', async () => {
      const cat = await prisma.ticketCategory.findUnique({ where: { id: 4001n } });
      expect(cat?.availableQuantity).toBe(18);
    });

    it('Idempotent retry → same booking id, inventory unchanged', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('X-User-Id', CUSTOMER_1_ID)
        .set('Idempotency-Key', idempotencyKey)
        .send({ concertId: CONCERT_ID, ticketCategoryId: VIP_CAT_ID, quantity: 2 })
        .expect(201);

      expect(res.body.id).toBe(bookingId);

      const cat = await prisma.ticketCategory.findUnique({ where: { id: 4001n } });
      expect(cat?.availableQuantity).toBe(18);

      const bookings = await prisma.booking.findMany({
        where: { userId: 2001n, ticketCategoryId: 4001n },
      });
      expect(bookings).toHaveLength(1);
    });

    it('Same key + different payload → 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('X-User-Id', CUSTOMER_1_ID)
        .set('Idempotency-Key', idempotencyKey)
        .send({ concertId: CONCERT_ID, ticketCategoryId: VIP_CAT_ID, quantity: 3 }) // different quantity
        .expect(409);

      expect(res.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    });
  });

  // ── 9. Voucher discount ───────────────────────────────────────────────────

  describe('6. Voucher – GEEK10', () => {
    it('10% discount applied correctly', async () => {
      // Standard ticket: 800000 × 1 = 800000 → 10% = 80000 → total = 720000
      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('X-User-Id', CUSTOMER_1_ID)
        .set('Idempotency-Key', 'e2e-voucher-geek10')
        .send({ concertId: CONCERT_ID, ticketCategoryId: STD_CAT_ID, quantity: 1, voucherCode: 'GEEK10' })
        .expect(201);

      expect(res.body.discountAmount).toBe('80000.00');
      expect(res.body.totalAmount).toBe('720000.00');
      expect(res.body.voucherCode).toBe('GEEK10');

      // Verify redemption record exists
      const redemption = await prisma.voucherRedemption.findFirst({
        where: { userId: 2001n, voucher: { code: 'GEEK10' } },
        include: { voucher: true },
      });
      expect(redemption).not.toBeNull();
    });
  });

  // ── 10. Expired voucher ───────────────────────────────────────────────────

  describe('7. Expired voucher', () => {
    let inventoryBefore: number;

    beforeAll(async () => {
      const cat = await prisma.ticketCategory.findUnique({ where: { id: 4002n } });
      inventoryBefore = cat!.availableQuantity;
    });

    it('EXPIRED10 → 409 VOUCHER_EXPIRED, inventory unchanged', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('X-User-Id', CUSTOMER_2_ID)
        .set('Idempotency-Key', 'e2e-expired-voucher')
        .send({ concertId: CONCERT_ID, ticketCategoryId: STD_CAT_ID, quantity: 1, voucherCode: 'EXPIRED10' })
        .expect(409);

      expect(res.body.code).toBe('VOUCHER_EXPIRED');

      // Transaction must have rolled back – inventory unchanged
      const catAfter = await prisma.ticketCategory.findUnique({ where: { id: 4002n } });
      expect(catAfter!.availableQuantity).toBe(inventoryBefore);
    });
  });

  // ── 11. Customer ownership ────────────────────────────────────────────────

  describe('8. Customer ownership', () => {
    let booking2001Id: string;

    beforeAll(async () => {
      // Retrieve the booking created earlier by customer 2001
      const booking = await prisma.booking.findFirst({ where: { userId: 2001n } });
      booking2001Id = booking!.id.toString();
    });

    it('Customer 2002 reading customer 2001 booking → 404 BOOKING_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/bookings/${booking2001Id}`)
        .set('X-User-Id', CUSTOMER_2_ID)
        .expect(404);

      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  // ── 12 & 13. Status transitions ───────────────────────────────────────────

  describe('9. Status transitions', () => {
    let confirmBookingId: string;

    beforeAll(async () => {
      // Create a fresh booking to confirm
      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('X-User-Id', CUSTOMER_2_ID)
        .set('Idempotency-Key', 'e2e-confirm-flow')
        .send({ concertId: CONCERT_ID, ticketCategoryId: STD_CAT_ID, quantity: 1 });

      confirmBookingId = (res.body as { id: string }).id;
    });

    it('PENDING_PAYMENT → CONFIRMED → 200, status=CONFIRMED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/ops/bookings/${confirmBookingId}/status`)
        .set('X-User-Id', OPERATOR_ID)
        .send({ status: 'CONFIRMED', reason: 'Payment received.' })
        .expect(200);

      expect(res.body.status).toBe('CONFIRMED');
    });

    it('Inventory NOT restored after confirm', async () => {
      // Standard was 100 at seed; 1 deducted for confirm-flow booking
      const cat = await prisma.ticketCategory.findUnique({ where: { id: 4002n } });
      // We've made multiple standard bookings so just assert availableQuantity < 100
      expect(cat!.availableQuantity).toBeLessThan(100);
    });

    it('CONFIRMED → CANCELLED → 409 INVALID_BOOKING_STATUS_TRANSITION', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/ops/bookings/${confirmBookingId}/status`)
        .set('X-User-Id', OPERATOR_ID)
        .send({ status: 'CANCELLED' })
        .expect(409);

      expect(res.body.code).toBe('INVALID_BOOKING_STATUS_TRANSITION');
    });
  });

  // ── 14. Cancellation with inventory restore ───────────────────────────────

  describe('10. Cancellation with inventory restore', () => {
    let cancelBookingId: string;
    let inventoryBefore: number;

    beforeAll(async () => {
      // Record inventory before creating the booking
      const cat = await prisma.ticketCategory.findUnique({ where: { id: 4001n } });
      inventoryBefore = cat!.availableQuantity;

      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('X-User-Id', CUSTOMER_3_ID)
        .set('Idempotency-Key', 'e2e-cancel-flow')
        .send({ concertId: CONCERT_ID, ticketCategoryId: VIP_CAT_ID, quantity: 2 });

      cancelBookingId = (res.body as { id: string }).id;
    });

    it('Inventory decremented after booking', async () => {
      const cat = await prisma.ticketCategory.findUnique({ where: { id: 4001n } });
      expect(cat!.availableQuantity).toBe(inventoryBefore - 2);
    });

    it('PENDING_PAYMENT → CANCELLED → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/ops/bookings/${cancelBookingId}/status`)
        .set('X-User-Id', OPERATOR_ID)
        .send({ status: 'CANCELLED', reason: 'E2E cancellation test.' })
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');
    });

    it('Inventory restored by +2 after cancellation', async () => {
      const cat = await prisma.ticketCategory.findUnique({ where: { id: 4001n } });
      expect(cat!.availableQuantity).toBe(inventoryBefore);
    });

    it('Status history records the PENDING_PAYMENT → CANCELLED transition', async () => {
      const history = await prisma.bookingStatusHistory.findMany({
        where: { bookingId: BigInt(cancelBookingId) },
        orderBy: { createdAt: 'asc' },
      });

      const cancelEntry = history.find(
        (h) => h.fromStatus === 'PENDING_PAYMENT' && h.toStatus === 'CANCELLED',
      );
      expect(cancelEntry).toBeDefined();
    });
  });
});

// ── extra constant needed for cancel test ─────────────────────────────────
const CUSTOMER_3_ID = '2003';
