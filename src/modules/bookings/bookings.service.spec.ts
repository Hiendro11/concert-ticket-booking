import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

describe('BookingsService - Pure Business Logic', () => {
  let service: any; // Using 'any' to easily test private pure methods without extracting them

  beforeEach(async () => {
    // We only need to instantiate the service, no actual DB connection needed
    // for testing these pure methods.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: PrismaService,
          useValue: {}, // Mocked completely since we only test pure functions
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  describe('normalizeVoucherCode', () => {
    it('should trim and uppercase voucher codes', () => {
      expect(service.normalizeVoucherCode(' geek10 ')).toBe('GEEK10');
      expect(service.normalizeVoucherCode('Flash50k')).toBe('FLASH50K');
    });

    it('should return null for empty or undefined', () => {
      expect(service.normalizeVoucherCode(undefined)).toBeNull();
      expect(service.normalizeVoucherCode('')).toBeNull();
      expect(service.normalizeVoucherCode('   ')).toBeNull();
    });
  });

  describe('calculateDiscount', () => {
    it('should correctly calculate percentage discounts', () => {
      const subtotal = new Prisma.Decimal('1000000');
      const discountValue = new Prisma.Decimal('10'); // 10%
      const discount = service.calculateDiscount(subtotal, 'PERCENTAGE', discountValue);
      expect(discount.toString()).toBe('100000');
    });

    it('should correctly handle fixed amount discounts', () => {
      const subtotal = new Prisma.Decimal('1000000');
      const discountValue = new Prisma.Decimal('150000'); // 150k
      const discount = service.calculateDiscount(subtotal, 'FIXED_AMOUNT', discountValue);
      expect(discount.toString()).toBe('150000');
    });

    it('should never return a discount greater than the subtotal', () => {
      const subtotal = new Prisma.Decimal('50000');
      const discountValue = new Prisma.Decimal('100000'); // 100k, larger than subtotal
      const discount = service.calculateDiscount(subtotal, 'FIXED_AMOUNT', discountValue);
      expect(discount.toString()).toBe('50000'); // Maxes out at subtotal
    });
  });

  describe('createRequestHash', () => {
    it('should generate consistent hashes for the same payload', () => {
      const payload = {
        concertId: 1,
        ticketCategoryId: 2,
        quantity: 2,
      };
      const hash1 = service.createRequestHash(payload, 'GEEK10');
      const hash2 = service.createRequestHash(payload, 'GEEK10');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different voucher codes', () => {
      const payload = {
        concertId: 1,
        ticketCategoryId: 2,
        quantity: 2,
      };
      const hash1 = service.createRequestHash(payload, 'GEEK10');
      const hash2 = service.createRequestHash(payload, null);
      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different quantities', () => {
      const hash1 = service.createRequestHash({ concertId: 1, ticketCategoryId: 2, quantity: 2 }, null);
      const hash2 = service.createRequestHash({ concertId: 1, ticketCategoryId: 2, quantity: 3 }, null);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('defaultStatusReason', () => {
    it('should return correct default reasons for status transitions', () => {
      expect(service.defaultStatusReason('CONFIRMED')).toContain('confirmed');
      expect(service.defaultStatusReason('CANCELLED')).toContain('cancelled');
      expect(service.defaultStatusReason('EXPIRED')).toContain('expired');
    });
  });
});
