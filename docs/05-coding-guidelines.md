# Coding Guidelines

This document defines the coding conventions used by the Concert Ticket Booking backend.

The goal is not to prescribe a universal NestJS style. These guidelines describe the conventions intentionally used in this repository so that implementation decisions remain consistent, reviewable, and easy to defend.

---

## 1. General Principles

Prefer:

- correctness before cleverness;
- explicit business rules over hidden behavior;
- database-enforced invariants over application-only checks;
- small modules with clear responsibilities;
- deterministic behavior that is easy to test;
- simple infrastructure unless complexity is justified by a measured requirement.

Avoid:

- premature microservices;
- unnecessary abstractions;
- JavaScript floating-point arithmetic for money;
- unchecked `number` conversion for database `BIGINT` identifiers;
- business correctness that depends only on prior reads;
- long database transactions containing remote network calls;
- silently swallowing unexpected exceptions.

---

## 2. Project Structure

The application follows a modular-monolith structure.

```text
src/
├── common/
│   ├── auth/
│   ├── errors/
│   └── middleware/
│
├── database/
│   └── prisma/
│
├── health/
│
└── modules/
    ├── concerts/
    ├── bookings/
    └── operations/
```

### Module responsibilities

`concerts`

- public concert read APIs;
- published concert visibility rules.

`bookings`

- customer booking creation;
- ticket reservation;
- idempotency;
- voucher redemption;
- customer booking queries;
- booking state transition logic.

`operations`

- operator-only endpoints;
- concert setup and publishing;
- ticket category setup;
- inventory monitoring;
- operations booking views and status updates.

`database`

- Prisma client lifecycle;
- database connection configuration.

`common`

- shared authentication;
- common error handling;
- request ID middleware;
- cross-cutting infrastructure.

---

## 3. Module Boundaries

Modules should expose behavior through services instead of allowing unrelated modules to directly reimplement business logic.

Example:

```text
OperationsBookingsController
        ↓
BookingsService
        ↓
Prisma
```

The operations controller may call the booking service because booking lifecycle rules belong to the booking domain.

Do not duplicate the same status-transition logic inside the operations module.

### Good

```ts
return this.bookingsService.updateStatusForOperations(
  operator.id,
  params.bookingId,
  dto,
);
```

### Avoid

```ts
// Reimplementing booking transition rules directly
// inside OperationsService.
await prisma.booking.update(...);
await prisma.ticketCategory.update(...);
```

---

## 4. Controllers

Controllers should remain thin.

Their responsibilities are limited to:

- routing;
- request DTO binding;
- authentication and authorization guards;
- Swagger metadata;
- passing validated data to services.

Business logic belongs in services.

### Good

```ts
@Post()
createBooking(
  @CurrentUser() user: AuthenticatedUser,
  @Headers('idempotency-key') key: string,
  @Body() dto: CreateBookingDto,
) {
  return this.bookingsService.createBooking(
    user.id,
    key,
    dto,
  );
}
```

### Avoid

```ts
@Post()
async createBooking(...) {
  // voucher validation
  // inventory mutation
  // price calculation
  // database transaction
  // idempotency handling
}
```

---

## 5. DTO Validation

All externally supplied request data must be validated at the API boundary.

The application uses a global NestJS validation pipe with:

```text
transform = true
whitelist = true
forbidNonWhitelisted = true
```

DTOs should:

- reject unexpected properties;
- validate numeric ranges;
- validate identifier formats;
- restrict enums;
- normalize only where normalization is intentionally part of the API contract.

### Identifier DTO example

IDs are accepted as decimal strings.

```ts
@IsString()
@Matches(/^[1-9]\d*$/)
bookingId!: string;
```

Do not accept arbitrary strings and call `BigInt()` before validation.

### Quantity example

```ts
@IsInt()
@Min(1)
@Max(10)
quantity!: number;
```

---

## 6. BigInt Handling

Database identifiers use MySQL `BIGINT`.

JavaScript `number` cannot safely represent every 64-bit integer.

Therefore:

- Prisma models use `bigint`;
- API request identifiers are accepted as strings;
- API response identifiers are serialized as strings.

### Correct

```ts
const id = BigInt(dto.concertId);
```

Response:

```json
{
  "id": "123"
}
```

### Avoid

```ts
const id = Number(dto.concertId);
```

This can silently lose precision for sufficiently large values.

---

## 7. Money Handling

Money must not use JavaScript floating-point arithmetic.

Use Prisma `Decimal` for:

- ticket prices;
- subtotals;
- discounts;
- totals.

### Correct

```ts
const subtotal =
  unitPrice.mul(quantity);

const discount =
  subtotal
    .mul(discountValue)
    .div(100)
    .toDecimalPlaces(2);
```

### Avoid

```ts
const total =
  Number(price) * quantity;
```

API monetary values are serialized as strings:

```json
{
  "unitPrice": "800000.00",
  "subtotalAmount": "1600000.00",
  "discountAmount": "160000.00",
  "totalAmount": "1440000.00"
}
```

---

## 8. Error Handling

Expected application failures should use `AppException`.

Each business error has a stable machine-readable code.

Example:

```ts
throw new AppException(
  ErrorCode.BOOKING_NOT_FOUND,
  'Booking was not found.',
  HttpStatus.NOT_FOUND,
);
```

### Error response shape

```json
{
  "statusCode": 404,
  "code": "BOOKING_NOT_FOUND",
  "message": "Booking was not found.",
  "timestamp": "2026-08-08T12:00:00.000Z",
  "path": "/api/v1/bookings/123",
  "requestId": "..."
}
```

### Error-code principles

Use specific codes for meaningful business failures.

Examples:

```text
INSUFFICIENT_TICKET_INVENTORY
IDEMPOTENCY_KEY_CONFLICT
VOUCHER_EXPIRED
VOUCHER_ALREADY_USED
INVALID_BOOKING_STATUS_TRANSITION
```

Do not return an unstructured string for expected business failures.

### Unexpected exceptions

Unexpected exceptions must:

- be logged by the server;
- retain the request ID;
- return a generic client-safe error message;
- not expose stack traces to API consumers.

---

## 9. Authentication and Authorization

Authentication is intentionally simulated for the assessment using:

```http
X-User-Id
```

`UserContextGuard` is responsible for:

- ensuring the header exists;
- validating the ID;
- loading the user;
- attaching the authenticated user to the request.

`OperatorGuard` is responsible only for role authorization.

### Guard ordering

```ts
@UseGuards(
  UserContextGuard,
  OperatorGuard,
)
```

The identity guard must run before the role guard.

### Customer ownership

Customer booking access must include the user ID in the database predicate.

### Good

```ts
where: {
  id: bookingId,
  userId,
}
```

If another customer requests the resource, return `BOOKING_NOT_FOUND`.

Do not reveal that a booking exists but belongs to another user.

---

## 10. Database Transactions

Use a transaction when multiple writes form one business operation.

Examples:

- reserve inventory + create booking;
- consume voucher quota + create redemption;
- create idempotency result;
- update booking status + restore inventory + create history.

All parts must either commit together or roll back together.

### Transaction scope

Keep transactions as short as practical.

Do not call external services such as:

- payment providers;
- email providers;
- HTTP APIs;

inside a database transaction.

Remote calls can make locks live longer and increase contention.

---

## 11. Concurrency Rules

A prior read is not sufficient to enforce a concurrent business invariant.

Example of an unsafe approach:

```text
SELECT available_quantity
if enough:
    UPDATE available_quantity
```

Two requests may read the same value before either update commits.

Use database atomic operations instead.

---

## 12. Inventory Reservation

Ticket inventory must be reserved with a conditional update.

Conceptually:

```sql
UPDATE ticket_categories
SET available_quantity =
  available_quantity - :quantity
WHERE id = :category_id
  AND available_quantity >= :quantity;
```

The affected-row count is the authority.

```text
count = 1
    -> reservation succeeded

count = 0
    -> insufficient inventory
```

Never rely only on:

```ts
if (
  category.availableQuantity >=
  requestedQuantity
) {
  // decrement later
}
```

because the value may become stale immediately after it is read.

---

## 13. Idempotency

Booking creation requires a client-supplied `Idempotency-Key`.

The idempotency key is scoped by user.

Store a deterministic hash of the normalized request payload.

### Required behavior

```text
same user
same key
same request hash
    -> return original booking
```

```text
same user
same key
different request hash
    -> IDENTITY_KEY_CONFLICT
```

The real repository error code is:

```text
IDEMPOTENCY_KEY_CONFLICT
```

### Locking

When concurrent requests use the same key:

- create or locate the idempotency row;
- lock it;
- ensure only one request performs the booking mutation;
- retries return the completed booking.

Idempotency logic must be in the same transaction as the business mutation it protects.

---

## 14. Voucher Quota

Voucher quota is a concurrent resource.

Do not enforce quota only by reading:

```ts
if (voucher.usedCount < voucher.usageLimit)
```

The read is useful for validation messaging but is not authoritative.

Use an atomic conditional update:

```sql
UPDATE vouchers
SET used_count = used_count + 1
WHERE id = ?
  AND used_count < usage_limit
  AND status = 'ACTIVE'
  AND starts_at <= NOW(3)
  AND ends_at > NOW(3);
```

The affected-row count determines whether quota was consumed.

---

## 15. One Voucher per User

The database uniqueness constraint is the final authority for:

```text
one voucher redemption
per user
per voucher
```

Application pre-checks can improve error messages, but they cannot replace the unique constraint.

Concurrent requests can pass the same prior read.

The database constraint handles that race safely.

---

## 16. Booking Status State Machine

Allowed transitions:

```text
PENDING_PAYMENT -> CONFIRMED
PENDING_PAYMENT -> CANCELLED
PENDING_PAYMENT -> EXPIRED
```

Terminal states:

```text
CONFIRMED
CANCELLED
EXPIRED
```

Do not scatter state-transition rules across controllers or multiple services.

Keep the transition rules centralized in the booking service.

---

## 17. Exactly-Once Inventory Restoration

Cancellation and expiration restore reserved tickets.

The state change and inventory increment must happen in one transaction.

The booking row is locked before deciding whether restoration should occur.

Conceptually:

```text
lock booking
    ↓
read current state
    ↓
if already CANCELLED
    return idempotently
    ↓
if PENDING_PAYMENT
    transition to CANCELLED
    restore inventory
    add status history
    ↓
commit
```

This prevents repeated concurrent cancellation requests from incrementing inventory multiple times.

---

## 18. Database Constraints

Database constraints are treated as a final correctness layer.

Examples include:

- foreign keys;
- unique constraints;
- non-negative prices;
- valid quantity ranges;
- `available_quantity <= total_quantity`;
- valid voucher discount configuration;
- valid voucher quota values;
- valid voucher time windows.

Application validation improves API usability.

Database constraints protect data integrity when application logic is incorrect or concurrent.

Both layers are useful.

---

## 19. Query Patterns

### Public data

Public concert APIs must expose only published concerts.

Do not fetch all concerts and filter them in memory.

Filter directly in the database query.

### Ownership

Ownership constraints should be included in database predicates rather than fetched and checked later where practical.

### Pagination

List endpoints should be paginated.

Current booking APIs use cursor pagination.

Default:

```text
limit = 20
```

Maximum:

```text
limit = 100
```

Do not add an unbounded production-facing `findMany()` API.

---

## 20. Response Serialization

Never expose raw Prisma models directly when they contain values requiring transformation.

Response mapping should handle:

- `bigint` -> string;
- `Decimal` -> string;
- `Date` -> ISO 8601;
- related voucher data -> stable API field names.

Keep the public response contract independent from Prisma's internal representation.

---

## 21. Naming Conventions

### Files

Use kebab-case:

```text
booking-response.dto.ts
user-context.guard.ts
operations-bookings.controller.ts
```

### Classes

Use PascalCase:

```text
BookingsService
CreateBookingDto
OperatorGuard
```

### Variables and methods

Use camelCase:

```ts
bookingId
availableQuantity
findMyBookings()
updateStatusForOperations()
```

### Constants

Use descriptive camelCase for local constants.

Use uppercase only for true global/environment-style constants when appropriate.

---

## 22. TypeScript Rules

Prefer explicit types at service and module boundaries.

### Good

```ts
async findOneForUser(
  userId: bigint,
  bookingId: string,
): Promise<BookingResponseDto> {
```

Avoid unnecessary `any`.

Use:

```ts
unknown
```

for values whose type is genuinely unknown, especially exceptions.

### Error example

```ts
.catch((error: unknown) => {
  console.error(error);
});
```

Narrow the value before accessing type-specific properties.

---

## 23. Prisma Raw SQL

Use Prisma's parameterized raw-query APIs.

### Good

```ts
await tx.$queryRaw`
  SELECT id
  FROM bookings
  WHERE id = ${id}
  FOR UPDATE
`;
```

Values remain parameterized.

Avoid constructing SQL through string concatenation.

### Avoid

```ts
`SELECT * FROM bookings WHERE id = ${userInput}`
```

when the resulting string is passed as unsafe SQL.

Raw SQL is acceptable when it expresses an important database primitive more clearly than the ORM, for example:

- `SELECT ... FOR UPDATE`;
- atomic conditional voucher quota updates;
- specialized locking behavior.

---

## 24. Logging

Request IDs are the primary correlation mechanism.

Every request should have:

```http
X-Request-Id
```

Unexpected errors should log:

- HTTP method;
- request path;
- request ID;
- exception message;
- stack trace.

Do not log:

- passwords;
- database credentials;
- secret tokens;
- sensitive authorization data.

---

## 25. Seed Data

Development seed data must be deterministic.

A seed run should restore the same initial state so:

- manual testing is repeatable;
- Postman tests are repeatable;
- concurrency tests have known inventory values;
- debugging is easier.

The seed must refuse destructive reset behavior when:

```env
NODE_ENV=production
```

Delete tables in foreign-key-safe order.

---

## 26. Migration Rules

Schema changes must be represented by migrations.

Do not depend only on:

```bash
prisma db push
```

for repository history.

For local development:

```bash
npx prisma migrate dev
```

For applying committed migrations:

```bash
npx prisma migrate deploy
```

Database-specific constraints that Prisma schema syntax cannot fully express may be added through reviewed SQL migrations.

---

## 27. Testing Strategy

Testing should focus on business risks, not just line coverage.

### Unit tests

Useful for:

- pure price calculations;
- DTO-like business helpers;
- state transition helper logic.

### Integration / e2e tests

Useful for:

- authorization;
- validation;
- API response contracts;
- database behavior;
- complete booking flows.

### Concurrency tests

Required for behavior that sequential tests cannot prove.

Current concurrency scenarios include:

```text
inventory overselling
idempotency race
voucher quota race
cancellation race
```

---

## 28. Concurrency Test Philosophy

Do not weaken a failing concurrency test simply to make CI green.

If:

```text
50 concurrent requests
```

reveal:

- connection pool exhaustion;
- transaction timeout;
- deadlock;
- lock contention;
- unexpected HTTP 500;

investigate the infrastructure or transaction behavior.

A concurrency test discovering instability is useful information.

The test should model the business invariant and remain strong enough to catch violations.

---

## 29. Test Fixtures

Concurrency tests should:

1. reset deterministic data;
2. execute the concurrent requests;
3. assert HTTP outcomes;
4. query the database directly;
5. verify final invariants.

For example, an inventory race should verify both:

```text
20 HTTP successes
```

and:

```text
20 booking rows
available inventory = 0
```

Client responses alone are not sufficient evidence.

---

## 30. API Documentation

Every externally visible endpoint should be represented in Swagger.

Document:

- summary;
- path parameters;
- query parameters;
- request DTO;
- successful response type;
- meaningful error responses;
- required security headers.

Swagger should remain usable as an interactive reviewer interface.

---

## 31. Postman

The Postman collection should use environment variables rather than hardcoded local values where reuse is useful.

Examples:

```text
{{baseUrl}}
{{customerUserId}}
{{operatorUserId}}
{{bookingId}}
```

Where one request creates a resource needed later, its test script should save the ID.

Example:

```js
const body =
  pm.response.json();

pm.environment.set(
  'bookingId',
  body.id,
);
```

---

## 32. Comments

Comments should explain **why**, especially where code implements a non-obvious correctness strategy.

Useful comment:

```ts
/*
 * The database unique constraint is the final
 * authority under concurrent voucher requests.
 */
```

Less useful comment:

```ts
// Increment used count.
```

Avoid comments that merely repeat the code.

---

## 33. Avoid Premature Abstraction

Do not create an abstraction merely because two short blocks look similar.

Extract logic when it provides at least one of:

- a single owner for a business rule;
- improved testability;
- meaningful reuse;
- clearer service responsibilities.

For a time-bounded backend assessment, readable explicit code is usually preferable to a speculative framework.

---

## 34. Infrastructure Decisions

Introduce additional infrastructure only when it solves a demonstrated requirement.

Current design intentionally does not require:

```text
Redis
Kafka
RabbitMQ
microservices
distributed locks
```

MySQL is already required and provides:

- transactions;
- row locks;
- atomic conditional updates;
- uniqueness;
- durable state.

Adding distributed infrastructure without a concrete need increases failure modes and reviewer setup complexity.

---

## 35. Production-vs-Assessment Decisions

Some design choices are intentionally assessment-scoped.

Examples:

```text
X-User-Id authentication
manual EXPIRED transition
no payment gateway
no background worker
no notification system
```

Do not hide these limitations.

Document them explicitly and explain how they would evolve in production.

Clear scoping is preferable to pretending a simplified implementation is production-ready.

---

## 36. Pull Request / Commit Guidelines

Commits should describe one coherent engineering milestone.

Examples:

```text
feat(bookings): add atomic inventory reservation
feat(bookings): add voucher quota protection
test(bookings): prove retry idempotency under concurrency
feat(bookings): enforce booking status transitions
docs: add Postman collection and local environment
```

Avoid meaningless history such as:

```text
fix stuff
update
final
final2
```

Risk-heavy features should preferably be committed independently so reviewers can understand the progression.

---

## 37. Pre-Commit Checklist

Before committing a feature:

```bash
npm run build
```

Then verify relevant tests.

For database-sensitive changes:

```bash
npx prisma db seed
```

For booking correctness changes, run the relevant concurrency scenario.

Check:

```bash
git status
git diff
```

Do not accidentally commit:

- `.env`;
- credentials;
- editor-generated files;
- local log files;
- temporary test output.

---

## 38. Definition of Done

A backend feature is considered complete when:

- input is validated;
- authorization is correct;
- business invariants are enforced;
- database writes are atomic where required;
- concurrency has been considered;
- error codes are stable;
- API responses are serialized correctly;
- Swagger is updated;
- tests cover the important behavior;
- scope decisions are documented.

For concurrency-sensitive behavior, a sequential happy-path test alone is not sufficient.

---

## Summary

The repository follows one central engineering rule:

> Correctness-critical booking behavior should be enforced as close to the database transaction as possible, while the application layer provides clear validation, authorization, API contracts, and error semantics.

This keeps the system simple enough for the assessment while still addressing the main risks of a high-demand ticket booking workflow.
