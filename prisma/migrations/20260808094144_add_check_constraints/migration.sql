ALTER TABLE `ticket_categories`
  ADD CONSTRAINT `chk_ticket_categories_price`
    CHECK (`price` >= 0),
  ADD CONSTRAINT `chk_ticket_categories_available`
    CHECK (`available_quantity` <= `total_quantity`);

ALTER TABLE `bookings`
  ADD CONSTRAINT `chk_bookings_quantity`
    CHECK (`quantity` >= 1 AND `quantity` <= 10),
  ADD CONSTRAINT `chk_bookings_unit_price`
    CHECK (`unit_price` >= 0),
  ADD CONSTRAINT `chk_bookings_subtotal`
    CHECK (`subtotal` >= 0),
  ADD CONSTRAINT `chk_bookings_discount`
    CHECK (`discount_amount` >= 0 AND `discount_amount` <= `subtotal`),
  ADD CONSTRAINT `chk_bookings_total`
    CHECK (
      `total_amount` >= 0
      AND `total_amount` = `subtotal` - `discount_amount`
    );

ALTER TABLE `vouchers`
  ADD CONSTRAINT `chk_vouchers_discount_value`
    CHECK (`discount_value` > 0),
  ADD CONSTRAINT `chk_vouchers_percentage`
    CHECK (
      `discount_type` <> 'PERCENTAGE'
      OR `discount_value` <= 100
    ),
  ADD CONSTRAINT `chk_vouchers_usage_limit`
    CHECK (`usage_limit` > 0),
  ADD CONSTRAINT `chk_vouchers_used_count`
    CHECK (`used_count` <= `usage_limit`),
  ADD CONSTRAINT `chk_vouchers_time_window`
    CHECK (`starts_at` < `ends_at`);

ALTER TABLE `voucher_redemptions`
  ADD CONSTRAINT `chk_voucher_redemptions_discount`
    CHECK (`discount_amount` >= 0);