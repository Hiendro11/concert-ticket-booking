import { createHash } from 'crypto';

/**
 * Normalizes a voucher code by trimming whitespace and converting to uppercase.
 * Returns null if the input is empty or undefined.
 */
export function normalizeVoucherCode(
  voucherCode: string | undefined | null,
): string | null {
  if (!voucherCode) {
    return null;
  }

  const normalized = voucherCode.trim().toUpperCase();
  return normalized === '' ? null : normalized;
}

export interface CanonicalBookingRequest {
  concertId: number | string;
  ticketCategoryId: number | string;
  quantity: number;
  voucherCode: string | null;
}

/**
 * Calculates a deterministic SHA-256 hash of a canonical booking request.
 * Used for idempotency key conflict detection.
 */
export function createRequestHash(
  request: CanonicalBookingRequest,
): string {
  return createHash('sha256')
    .update(JSON.stringify(request))
    .digest('hex');
}
