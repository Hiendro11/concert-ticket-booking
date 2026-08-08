import { Prisma } from '../../generated/prisma/client';

/**
 * Calculates the discount amount for a booking.
 *
 * Rules:
 * - PERCENTAGE: subtotal * (discountValue / 100), rounded to 2 decimal places.
 * - FIXED_AMOUNT: discountValue, capped at subtotal (total can never go negative).
 */
export function calculateDiscount(
  subtotal: Prisma.Decimal,
  discountType: string,
  discountValue: Prisma.Decimal,
): Prisma.Decimal {
  let discount: Prisma.Decimal;

  if (discountType === 'PERCENTAGE') {
    discount = subtotal
      .mul(discountValue)
      .div(100)
      .toDecimalPlaces(2);
  } else {
    discount = discountValue.toDecimalPlaces(2);
  }

  /*
   * A fixed voucher must never make totalAmount negative.
   */
  if (discount.greaterThan(subtotal)) {
    return subtotal;
  }

  return discount;
}
