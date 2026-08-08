import { Prisma } from '../../generated/prisma/client';
import {
  normalizeVoucherCode,
  createRequestHash,
} from './booking-canonicalize';
import { calculateDiscount } from './booking-pricing';

describe('Booking Pure Business Logic', () => {
  describe('normalizeVoucherCode', () => {
    it('should trim and uppercase voucher codes', () => {
      expect(normalizeVoucherCode(' geek10 ')).toBe('GEEK10');
      expect(normalizeVoucherCode('Flash50k')).toBe('FLASH50K');
    });

    it('should return null for empty or undefined', () => {
      expect(normalizeVoucherCode(undefined)).toBeNull();
      expect(normalizeVoucherCode(null)).toBeNull();
      expect(normalizeVoucherCode('')).toBeNull();
      expect(normalizeVoucherCode('   ')).toBeNull();
    });
  });

  describe('calculateDiscount', () => {
    it('should correctly calculate percentage discounts', () => {
      const subtotal = new Prisma.Decimal('1000000');
      const discountValue = new Prisma.Decimal('10'); // 10%
      const discount = calculateDiscount(subtotal, 'PERCENTAGE', discountValue);
      expect(discount.toString()).toBe('100000');
    });

    it('should correctly handle fixed amount discounts', () => {
      const subtotal = new Prisma.Decimal('1000000');
      const discountValue = new Prisma.Decimal('150000');
      const discount = calculateDiscount(subtotal, 'FIXED_AMOUNT', discountValue);
      expect(discount.toString()).toBe('150000');
    });

    it('should never return a discount greater than the subtotal', () => {
      const subtotal = new Prisma.Decimal('50000');
      const discountValue = new Prisma.Decimal('100000'); // Larger than subtotal
      const discount = calculateDiscount(subtotal, 'FIXED_AMOUNT', discountValue);
      expect(discount.toString()).toBe('50000'); // Capped at subtotal
    });

    it('should round percentage discounts to 2 decimal places', () => {
      const subtotal = new Prisma.Decimal('100000');
      const discountValue = new Prisma.Decimal('33.333');
      const discount = calculateDiscount(subtotal, 'PERCENTAGE', discountValue);
      expect(discount.toFixed(2)).toBe('33333.00');
    });
  });

  describe('createRequestHash', () => {
    it('should generate consistent hashes for the same payload', () => {
      const payload = { concertId: 1, ticketCategoryId: 2, quantity: 2, voucherCode: 'GEEK10' };
      expect(createRequestHash(payload)).toBe(createRequestHash(payload));
    });

    it('should generate different hashes for different voucher codes', () => {
      const base = { concertId: 1, ticketCategoryId: 2, quantity: 2 };
      const h1 = createRequestHash({ ...base, voucherCode: 'GEEK10' });
      const h2 = createRequestHash({ ...base, voucherCode: null });
      expect(h1).not.toBe(h2);
    });

    it('should generate different hashes for different quantities', () => {
      const base = { concertId: 1, ticketCategoryId: 2, voucherCode: null };
      const h1 = createRequestHash({ ...base, quantity: 2 });
      const h2 = createRequestHash({ ...base, quantity: 3 });
      expect(h1).not.toBe(h2);
    });

    it('should generate different hashes for different concert IDs', () => {
      const base = { ticketCategoryId: 2, quantity: 2, voucherCode: null };
      const h1 = createRequestHash({ ...base, concertId: 1 });
      const h2 = createRequestHash({ ...base, concertId: 2 });
      expect(h1).not.toBe(h2);
    });
  });
});
