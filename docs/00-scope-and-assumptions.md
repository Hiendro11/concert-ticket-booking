# Scope and Assumptions
# 00 — Scope & Assumptions

## 1. Purpose

This document defines the implementation scope, business assumptions, core invariants, and intentional limitations for the **Concert Ticket Booking Platform** technical assessment.

The goal is to keep the system **small enough to complete and explain clearly**, while prioritizing the highest-risk backend concerns stated in the assessment:

- Prevent ticket overselling.
- Prevent duplicate bookings caused by client retries.
- Prevent promotional voucher abuse / over-redemption.
- Keep booking behavior stable and predictable during flash-sale traffic spikes.
- Support both customer-facing booking flows and internal operation workflows.

This document intentionally separates **assessment requirements** from **implementation assumptions** so every technical decision can be explained and defended.

---

## 2. Business Context

The system serves two main use cases:

### 2.1 Customer-facing flow

Customers can:

- Browse published concerts.
- View ticket categories and prices.
- Reserve tickets.
- Apply a promotional voucher.
- Track booking status.

### 2.2 Internal operation flow

Operators can:

- Monitor bookings.
- Create and publish concerts.
- Create/manage ticket categories and inventory.
- Validate ticket availability.
- Create voucher campaigns.
- Inspect failed or suspicious bookings.
- Manually update booking status when necessary.

---

## 3. Primary Engineering Objective

The system is designed around **correctness under concurrency**, not maximum feature count.

Priority order:

1. **Booking correctness**
2. **Inventory consistency**
3. **Idempotent request handling**
4. **Voucher consistency**
5. **Clear business workflow**
6. **Maintainable code structure**
7. **Operational visibility**
8. Additional convenience features

The implementation should remain simple enough that every important decision can be explained during review/interview.

---

## 4. Actors

### 4.1 CUSTOMER

A customer can browse concerts, reserve tickets, optionally apply a voucher, and view their booking status.

### 4.2 OPERATOR

An operator can manage concert/ticket data, monitor bookings, inspect inventory, create voucher campaigns, and perform allowed manual booking-status updates.

> **Assumption:** Full production-grade authentication and role-based access control are not part of the core assessment scope. The codebase will still keep customer and operator APIs logically separated so proper authentication/authorization can be added later.

---

## 5. In-Scope Features

## 5.1 Customer APIs

The implementation will support:

- List published concerts.
- View concert details.
- View available ticket categories and prices.
- Create a booking/reservation.
- Book one ticket category with a requested quantity.
- Optionally apply one voucher when creating a booking.
- Retry booking creation safely using an idempotency key.
- View booking details/status.
- View the customer's bookings.

### Intended booking request

A booking request conceptually contains:

```json
{
  "concertId": "concert-id",
  "ticketCategoryId": "ticket-category-id",
  "quantity": 2,
  "voucherCode": "GEEK50"
}
```

The exact API contract will be defined in the API design document.

---

## 5.2 Operation APIs

The implementation will support a focused set of operation workflows:

- Create a concert.
- Create ticket categories for a concert.
- Publish a concert.
- View concert inventory.
- View/search bookings.
- View booking details.
- Manually change a booking status through valid state transitions.
- Create a voucher campaign.

The operation scope is intentionally focused on workflows that directly support booking correctness and launch-week operations.

---

## 6. Business Assumptions

The assessment does not define every business rule. The following rules are explicit implementation assumptions.

### A-01 — Tickets are category-based, not seat-based

Tickets are sold by category such as:

- VIP
- Standard
- Economy

The system does **not** support seat maps or assigned seating.

**Reason:** The assessment refers to ticket categories and limited quantities, but does not require individual seat selection.

---

### A-02 — One booking contains one ticket category

A single booking reserves a quantity from one ticket category.

Example:

```text
Booking A
- Concert: GEEK Music Night
- Category: VIP
- Quantity: 2
```

If a customer wants different categories, they create separate bookings.

**Reason:** This reduces transaction complexity and keeps the assessment focused on inventory correctness, idempotency, and voucher consistency.

**Future extension:** Introduce `booking_items` to support multiple categories in one booking.

---

### A-03 — Quantity must be positive and bounded

A booking quantity must be greater than zero.

The implementation may enforce a configurable maximum quantity per booking to reduce accidental or abusive bulk reservations.

> Initial implementation assumption: maximum **10 tickets per booking**.

---

### A-04 — Only published concerts can be booked

A concert has at least these states:

```text
DRAFT
PUBLISHED
CANCELLED
```

Only `PUBLISHED` concerts accept new bookings.

---

### A-05 — Ticket inventory in MySQL is the source of truth

Ticket availability is persisted in **MySQL/InnoDB**.

The backend must never rely only on an in-memory counter or cache for authoritative inventory decisions.

---

### A-06 — Reservation succeeds only when enough inventory exists

For requested quantity `q`:

```text
available_quantity >= q
```

must be true at the moment the inventory update is committed.

If not enough inventory exists, the booking request fails with a business error such as:

```text
INSUFFICIENT_TICKET_INVENTORY
```

---

### A-07 — Booking creation is transactional

The following operations belong to one logical transaction:

```text
validate request
    ↓
ensure idempotency
    ↓
reserve ticket inventory
    ↓
reserve voucher usage (if provided)
    ↓
create booking
    ↓
commit
```

If any required step fails:

```text
ROLLBACK
```

No partial booking should remain.

---

### A-08 — One booking can use at most one voucher

A booking can have:

```text
0 or 1 voucher
```

Multiple vouchers cannot be stacked.

---

### A-09 — Voucher campaigns have finite usage

A voucher may define:

- Code
- Active period
- Total usage limit
- Used count
- Discount type/value
- Optional per-user limit

A voucher cannot be successfully redeemed after reaching its total usage limit.

---

### A-10 — A customer can use the same voucher at most once

For this assessment:

```text
same user + same voucher => maximum 1 successful redemption
```

This rule is an assumption introduced to address voucher abuse explicitly.

The database should enforce this rule with a unique constraint where appropriate.

---

### A-11 — Voucher eligibility is checked during booking creation

Voucher validation happens before the booking transaction commits.

Typical checks include:

- Voucher exists.
- Voucher is active.
- Current time is inside its active period.
- Usage quota is not exhausted.
- Customer has not already redeemed it.
- Voucher is eligible for the booking according to the implemented scope.

---

### A-12 — Payment gateway integration is not implemented

The assessment backend does not integrate with a real payment provider.

A successful reservation initially enters:

```text
PENDING_PAYMENT
```

The payment-result flow is represented through controlled booking-status transitions.

---

## 7. Booking State Machine

The implementation uses a small, explicit state machine.

```text
                         ┌────────────> CONFIRMED
                         │
PENDING_PAYMENT ─────────┼────────────> CANCELLED
                         │
                         └────────────> EXPIRED
```

### Allowed transitions

| Current state | Next state |
|---|---|
| `PENDING_PAYMENT` | `CONFIRMED` |
| `PENDING_PAYMENT` | `CANCELLED` |
| `PENDING_PAYMENT` | `EXPIRED` |

Terminal states:

```text
CONFIRMED
CANCELLED
EXPIRED
```

For the assessment scope, terminal bookings are not moved back to `PENDING_PAYMENT`.

### Invalid examples

```text
CONFIRMED -> PENDING_PAYMENT
CANCELLED -> CONFIRMED
EXPIRED -> CONFIRMED
```

These must be rejected by application-level business validation.

> **Assumption:** Automatic expiration scheduling may be omitted from the first implementation if time is limited. The `EXPIRED` state and transition rule will still be modeled and documented.

---

## 8. Core System Invariants

These invariants are the most important correctness guarantees in the system.

### INV-01 — Inventory never becomes negative

```text
available_quantity >= 0
```

must always hold.

---

### INV-02 — Successful reservations never exceed inventory

Concurrent requests must never cause more tickets to be reserved than the configured available quantity.

Example:

```text
Inventory = 100 tickets
Concurrent demand = 500 tickets

Maximum successfully reserved = 100
```

---

### INV-03 — Retry must not create duplicate bookings

The same logical booking request retried with the same idempotency key must not create multiple bookings.

Conceptual guarantee:

```text
same customer
+ same idempotency key
= same logical booking result
```

---

### INV-04 — Voucher usage never exceeds campaign quota

```text
used_count <= usage_limit
```

must always hold, including under concurrent booking requests.

---

### INV-05 — Per-user voucher limit is enforced

For vouchers configured with a one-use-per-user rule:

```text
successful_redemptions(voucher, customer) <= 1
```

---

### INV-06 — Booking creation is atomic

A booking must not exist in a partially committed state.

For example, this is forbidden:

```text
inventory deducted
voucher rejected
booking not created
inventory remains deducted
```

All related writes must succeed together or be rolled back together.

---

### INV-07 — Only valid booking-state transitions are accepted

The operator cannot arbitrarily assign any status.

Every status change must satisfy the defined state machine.

---

### INV-08 — Only published concerts can receive new reservations

```text
concert.status != PUBLISHED
=> booking creation rejected
```

---

## 9. Concurrency Strategy — Scope-Level Decision

The authoritative booking path will use **MySQL 8 with InnoDB transactions**.

Inventory correctness will be protected at the database level instead of using application memory.

Preferred implementation approach:

```sql
UPDATE ticket_categories
SET available_quantity = available_quantity - ?
WHERE id = ?
  AND available_quantity >= ?;
```

The application checks affected rows:

```text
1 row updated -> reservation succeeded
0 rows updated -> insufficient inventory / contention result
```

Voucher quota will use an equivalent database-safe update strategy.

Where additional coordination is required, explicit row locking such as:

```sql
SELECT ... FOR UPDATE
```

may be used inside a short transaction.

### Why this direction

- Keeps MySQL as the single source of truth.
- Avoids race-prone read-then-write application logic.
- Avoids unnecessary distributed-lock infrastructure.
- Is sufficient for the traffic level described in the assessment.
- Is easy to demonstrate with concurrency tests.

Detailed transaction and locking decisions will be documented separately.

---

## 10. Idempotency Assumption

Booking creation accepts an idempotency key supplied by the client, for example:

```http
Idempotency-Key: 87a9a9e8-...
```

The system associates the key with:

- Customer identity
- Request fingerprint/hash
- Booking result

Expected behavior:

### Same key + same request

Return the previously created logical result instead of creating another booking.

### Same key + different request

Reject the request as an idempotency conflict.

This prevents a timeout/retry scenario from consuming inventory twice.

---

## 11. Data Consistency Principles

The implementation follows these principles:

- MySQL/InnoDB is the authoritative transactional store.
- Business-critical constraints should be enforced as close to the database as practical.
- Unique constraints are preferred over application-only duplicate checks.
- Transactions should be short.
- Network calls must not be placed inside critical database transactions.
- Inventory and voucher quota updates must be concurrency-safe.
- Failed transactions must leave no partial business state.

---

## 12. Intentional Out-of-Scope Features

The following are intentionally excluded from the core assessment implementation:

- Real payment gateway integration.
- Payment provider webhook handling.
- Refund processing.
- Assigned seating / seat map.
- Email notification.
- SMS notification.
- Recommendation engine.
- Waiting-room system.
- Full fraud-detection engine.
- Full production IAM / OAuth / SSO.
- Complex RBAC administration.
- Multi-currency pricing.
- Multiple vouchers per booking.
- Full voucher update/delete lifecycle.
- Partial booking cancellation.
- Ticket transfer/resale.
- Kubernetes deployment.
- Microservices.
- Kafka/RabbitMQ-based event architecture.
- Multi-region deployment.
- Distributed database architecture.

### Scope rationale

These features are excluded to spend implementation time on the business risks emphasized by the assessment:

```text
overselling
duplicate booking retries
voucher abuse
flash-sale consistency
operation recovery
```

This is a prioritization decision, not an assumption that these features are unnecessary in a production product.

---

## 13. Technology Direction

The planned implementation stack is:

| Area | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Database | MySQL 8 |
| Storage Engine | InnoDB |
| API Style | REST |
| API Documentation | Swagger / OpenAPI |
| Unit Testing | Jest |
| API / Integration Testing | Supertest |
| Load / Concurrency Testing | k6 and/or dedicated test scripts |
| Local Environment | Docker + Docker Compose |
| API Testing Collection | Postman |

### Database decision

MySQL/InnoDB is selected because the booking domain requires:

- ACID transactions.
- Row-level locking.
- Unique constraints.
- Atomic conditional updates.
- Reliable rollback behavior.

The expected assessment traffic does not justify introducing a more complex distributed data layer.

---

## 14. Non-Functional Priorities

The implementation prioritizes the following qualities.

### Correctness

Business invariants must remain valid under concurrency.

### Maintainability

Business logic should not live directly inside HTTP controllers.

### Explainability

Every major design decision should have a clear reason and trade-off.

### Testability

Critical business rules must be demonstrable through automated tests.

### Local reproducibility

A reviewer should be able to run the system locally using documented commands.

### Observability — assessment scope

Application logs should make important booking failures understandable, especially:

- Inventory exhausted.
- Voucher rejected.
- Duplicate/idempotent retry.
- Invalid status transition.
- Unexpected transaction failure.

Production-grade monitoring infrastructure is outside the current scope.

---

## 15. Critical Test Scenarios

The following scenarios are considered part of the definition of done.

### T-01 — Overselling test

```text
Initial inventory: 100

Concurrent requests attempt to reserve more than 100 tickets.

Expected:
- Successful reserved quantity <= 100
- available_quantity == 0 after full sell-out
- available_quantity never becomes negative
```

---

### T-02 — Idempotent retry test

```text
Multiple concurrent requests
same customer
same Idempotency-Key
same payload
```

Expected:

```text
one logical booking
inventory deducted once
all successful retry responses reference the same result
```

---

### T-03 — Voucher quota concurrency test

```text
Voucher usage_limit = 10
More than 10 eligible customers redeem concurrently
```

Expected:

```text
successful redemptions <= 10
used_count == 10 at exhaustion
```

---

### T-04 — Per-user voucher abuse test

Same customer attempts to redeem the same one-use voucher multiple times.

Expected:

```text
maximum one successful redemption
```

---

### T-05 — Transaction rollback test

Example:

```text
inventory reservation succeeds
voucher reservation fails
```

Expected:

```text
booking not created
inventory restored by transaction rollback
voucher usage unchanged
```

---

### T-06 — Invalid booking transition test

Example:

```text
CONFIRMED -> PENDING_PAYMENT
```

Expected:

```text
request rejected
database state unchanged
```

---

### T-07 — Unpublished concert booking test

Customer attempts to book a `DRAFT` or `CANCELLED` concert.

Expected:

```text
booking rejected
inventory unchanged
```

---

## 16. Definition of Done

The assessment implementation is considered complete when:

- The project can be started locally from documented instructions.
- MySQL can be started through Docker Compose.
- Database migrations work from a clean environment.
- Seed data is available for reviewer testing.
- Swagger/OpenAPI documentation is accessible.
- A Postman collection works against the local environment.
- Customer booking flow works end-to-end.
- Core operation flow works end-to-end.
- Booking retries are idempotent.
- Ticket overselling is prevented.
- Voucher quota over-redemption is prevented.
- Invalid booking status transitions are rejected.
- Unit/integration tests pass.
- Concurrency tests demonstrate the critical invariants.
- Scope, assumptions, limitations, and trade-offs are documented.

---

## 17. Success Criteria

A successful submission should make the following statements demonstrably true:

```text
1. Ticket inventory never becomes negative.

2. Concurrent customers cannot reserve more tickets
   than the configured inventory.

3. Retrying a booking request does not create
   duplicate bookings or double-deduct inventory.

4. Concurrent voucher redemption cannot exceed
   the campaign quota.

5. A customer cannot abuse a voucher beyond
   the configured per-user limit.

6. Booking creation behaves atomically.

7. Booking statuses follow explicit business rules.

8. The system is intentionally simple and can be
   explained end-to-end by the engineer who built it.
```

---

## 18. Notes for Later Design Documents

The following topics are intentionally deferred to dedicated documents:

```text
01-system-design.md
    - architecture
    - module boundaries
    - request flow
    - scaling strategy
    - failure scenarios

02-database-design.md
    - ERD
    - table definitions
    - indexes
    - foreign keys
    - unique constraints
    - transaction boundaries

03-booking-workflow.md
    - create-booking sequence
    - idempotency flow
    - state transitions
    - rollback scenarios

04-concurrency-and-consistency.md
    - overselling analysis
    - MySQL locking behavior
    - atomic updates
    - voucher concurrency
    - concurrency test strategy

05-api-design.md
    - customer APIs
    - operation APIs
    - request/response formats
    - error model
```

---

## 19. Final Scope Statement

This assessment intentionally implements a **focused concert-booking backend** rather than a production-complete ticketing platform.

The main engineering effort is invested in:

```text
safe inventory reservation
+ idempotent booking creation
+ safe voucher redemption
+ transactional consistency
+ explicit booking workflow
+ operational recovery
+ automated evidence through tests
```

Anything outside these priorities is either simplified or explicitly documented as out of scope.
