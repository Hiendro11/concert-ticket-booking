# Concert Ticket Booking Platform

Backend technical assessment for the **GEEK Internship Autumn 2026 - Product Backend Engineer** role.

This project implements a concert ticket booking backend focused on correctness under high contention, especially:

- preventing ticket overselling;
- preventing duplicate bookings caused by client retries;
- enforcing voucher usage limits safely under concurrency;
- protecting one-voucher-per-user rules;
- enforcing booking status transitions;
- restoring ticket inventory exactly once when a booking is cancelled or expired.

The system is intentionally implemented as a **modular monolith** to keep the architecture simple, testable, and appropriate for the scope of the assessment.

---

## Tech Stack

- Node.js 22
- TypeScript
- NestJS
- Prisma ORM 7
- MySQL 8.4 / InnoDB
- Docker Compose
- Swagger / OpenAPI
- Postman
- Jest / Supertest
- Custom concurrency test scripts

---

## Architecture

The backend is organized as a modular monolith.

Main modules:

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

MySQL is the authoritative store for:

- ticket inventory;
- booking state;
- voucher quota;
- voucher redemption history;
- idempotency state.

No Redis, Kafka, or distributed lock service is required for the current scope.

---

## Core Business Rules

### Ticket inventory

Inventory is reserved atomically inside the booking transaction.

A booking only succeeds when:

```text
available_quantity >= requested_quantity
```

The decrement is performed directly in the database using a conditional update.

This prevents two concurrent requests from both reserving the same remaining tickets.

### Idempotency

Creating a booking requires:

```http
Idempotency-Key: <unique-client-request-key>
```

The key is scoped to the user.

Behavior:

```text
same user + same key + same payload
    -> returns the original booking

same user + same key + different payload
    -> 409 IDEMPOTENCY_KEY_CONFLICT
```

The booking and its idempotency record are committed in the same database transaction.

### Voucher protection

Voucher redemption is protected by:

- active time window validation;
- voucher status validation;
- atomic quota increment;
- database uniqueness for one redemption per user;
- the same transaction as ticket reservation and booking creation.

A failed voucher validation rolls back the ticket reservation.

### Booking state machine

Supported transitions:

```text
PENDING_PAYMENT
    ├──> CONFIRMED
    ├──> CANCELLED
    └──> EXPIRED
```

`CONFIRMED`, `CANCELLED`, and `EXPIRED` are terminal states.

Repeated requests for the same terminal state are treated as idempotent.

### Inventory restoration

When a booking changes:

```text
PENDING_PAYMENT -> CANCELLED
```

or:

```text
PENDING_PAYMENT -> EXPIRED
```

the reserved tickets are restored in the same transaction.

Concurrent repeated cancellation requests restore inventory only once.

### Voucher restoration policy

Voucher quota is **not restored** when a booking is cancelled or expired.

The redemption record is preserved as historical usage.

This is an explicit scope assumption for the assessment.

---

## Prerequisites

Install:

- Node.js 22+
- npm
- Docker Desktop
- Git

Verify:

```bash
node --version
npm --version
docker --version
docker compose version
```

---

## Environment Configuration

Create `.env` in the project root.

Example:

```env
NODE_ENV=development
PORT=3000

MYSQL_DATABASE=concert_ticket_booking
MYSQL_USER=concert_app
MYSQL_PASSWORD=concert_dev_password
MYSQL_ROOT_PASSWORD=root_dev_password

DATABASE_URL="mysql://concert_app:concert_dev_password@localhost:3306/concert_ticket_booking"

SHADOW_DATABASE_URL="mysql://concert_app:concert_dev_password@localhost:3306/concert_ticket_booking_shadow"
```

Do not commit real secrets.

Use `.env.example` as the reference configuration.

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start MySQL

```bash
docker compose up -d
```

Check:

```bash
docker compose ps
```

### 3. Create the Prisma shadow database

For local Prisma migration development, create the shadow database once:

```bash
docker compose exec mysql mysql -uroot -proot_dev_password -e "CREATE DATABASE IF NOT EXISTS concert_ticket_booking_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON concert_ticket_booking_shadow.* TO 'concert_app'@'%'; FLUSH PRIVILEGES;"
```

### 4. Apply database migrations

For an existing migration history:

```bash
npx prisma migrate deploy
```

For migration development:

```bash
npx prisma migrate dev
```

### 5. Generate Prisma Client

```bash
npx prisma generate
```

### 6. Seed deterministic development data

```bash
npx prisma db seed
```

### 7. Start the API

```bash
npm run start:dev
```

API:

```text
http://localhost:3000
```

Swagger:

```text
http://localhost:3000/docs
```

Health:

```text
http://localhost:3000/health
```

---

## Seed Data

The seed is deterministic and resets development data.

### Users

| Role | X-User-Id |
| --- | ---: |
| Operator | `1001` |
| Customer 1 | `2001` |
| Customer 2 | `2002` |
| Customer 3 | `2003` |
| Load-test customers | `2101` - `2110` |

Authentication is intentionally simulated for the assessment using:

```http
X-User-Id: 2001
```

This is not intended as a production authentication design.

### Concerts

```text
3001 - Neon Pulse Live 2026
       status: PUBLISHED

3002 - Indie Skyline Sessions 2026
       status: DRAFT
```

### Ticket categories

```text
4001 - VIP
       price: 2,000,000
       quantity: 20

4002 - Standard
       price: 800,000
       quantity: 100

4003 - General Admission
       draft concert
       quantity: 80
```

### Vouchers

```text
GEEK10
- 10% discount
- quota: 10

FLASH50K
- fixed 50,000 discount
- quota: 5

EXPIRED10
- expired fixture for negative tests
```

---

## API Overview

### Health

```http
GET /health
```

### Public concerts

```http
GET /api/v1/concerts
GET /api/v1/concerts/:concertId
```

Only published concerts are exposed publicly.

### Customer bookings

```http
POST /api/v1/bookings
GET  /api/v1/bookings/:bookingId
GET  /api/v1/me/bookings
```

Booking creation requires:

```http
X-User-Id: 2001
Idempotency-Key: unique-request-key
```

Example:

```json
{
  "concertId": "3001",
  "ticketCategoryId": "4001",
  "quantity": 2,
  "voucherCode": "GEEK10"
}
```

### Operations - concerts

```http
POST /api/v1/ops/concerts
POST /api/v1/ops/concerts/:concertId/ticket-categories
POST /api/v1/ops/concerts/:concertId/publish
GET  /api/v1/ops/concerts/:concertId/inventory
```

Requires an operator:

```http
X-User-Id: 1001
```

### Operations - bookings

```http
GET   /api/v1/ops/bookings
GET   /api/v1/ops/bookings/:bookingId
PATCH /api/v1/ops/bookings/:bookingId/status
```

Example status update:

```json
{
  "status": "CANCELLED",
  "reason": "Cancelled by operations."
}
```

---

## Pagination

Booking list endpoints use cursor pagination.

Example:

```http
GET /api/v1/me/bookings?limit=20
```

Response:

```json
{
  "items": [],
  "nextCursor": null
}
```

If `nextCursor` is returned:

```http
GET /api/v1/me/bookings?limit=20&cursor=<nextCursor>
```

The maximum page size is 100.

---

## Error Response Format

Errors use a consistent structure.

Example:

```json
{
  "statusCode": 409,
  "code": "INSUFFICIENT_TICKET_INVENTORY",
  "message": "Insufficient ticket inventory.",
  "timestamp": "2026-08-08T12:00:00.000Z",
  "path": "/api/v1/bookings",
  "requestId": "..."
}
```

Common business error codes include:

```text
VALIDATION_ERROR
USER_ID_REQUIRED
INVALID_USER_ID
USER_NOT_FOUND
OPERATOR_ACCESS_REQUIRED

CONCERT_NOT_FOUND
CONCERT_NOT_PUBLISHED

TICKET_CATEGORY_NOT_FOUND
INSUFFICIENT_TICKET_INVENTORY

BOOKING_NOT_FOUND
INVALID_BOOKING_STATUS_TRANSITION

VOUCHER_NOT_FOUND
VOUCHER_INACTIVE
VOUCHER_NOT_STARTED
VOUCHER_EXPIRED
VOUCHER_USAGE_LIMIT_REACHED
VOUCHER_ALREADY_USED

IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_CONFLICT
```

---

## Request IDs

Every API response contains:

```http
X-Request-Id
```

Clients may also provide an incoming request ID.

The request ID is included in error responses and server logs to help correlate failures.

---

## Swagger

Swagger UI is available at:

```text
http://localhost:3000/docs
```

Swagger exposes the assessment identity headers as API security schemes:

```text
X-User-Id
Idempotency-Key
```

---

## Postman

Postman files are included under:

```text
postman/
├── Concert-Ticket-Booking.postman_collection.json
└── Local.postman_environment.json
```

Import both into Postman.

Select:

```text
Concert Ticket Booking - Local
```

Recommended folder order:

```text
00 - Health
01 - Public Concerts
02 - Customer Bookings
03 - Operations Concerts
04 - Operations Bookings
05 - Validation and Auth Errors
```

Run:

```bash
npx prisma db seed
```

before running the collection to restore deterministic fixtures.

---

## Build

```bash
npm run build
```

---

## Automated Tests

Run the normal test suite:

```bash
npm test
```

If end-to-end tests are configured:

```bash
npm run test:e2e
```

---

## Concurrency Tests

The repository includes dedicated concurrency tests for critical business risks.

The NestJS application must be running before executing these tests.

### Inventory overselling

```bash
npm run test:concurrency:inventory
```

Scenario:

```text
50 concurrent booking requests
20 VIP tickets available
```

Expected invariant:

```text
20 successful bookings
30 inventory rejections
0 unexpected failures
0 tickets remaining
20 booking rows
```

### Idempotency race

```bash
npm run test:concurrency:idempotency
```

Scenario:

```text
10 concurrent retries
same user
same Idempotency-Key
same payload
```

Expected invariant:

```text
1 logical booking
1 booking row
1 idempotency row
inventory decremented once
```

### Voucher quota race

```bash
npm run test:concurrency:voucher
```

Scenario:

```text
10 different customers
FLASH50K quota = 5
```

Expected invariant:

```text
5 successful bookings
5 quota rejections
voucher used_count = 5
5 redemption rows
ticket inventory decremented only for committed bookings
```

### Same-user voucher abuse

```bash
npm run test:concurrency:voucher-abuse
```

Scenario:

```text
10 concurrent booking requests
same customer
same one-time voucher (GEEK10)
different idempotency keys
```

Expected invariant:

```text
1 successful booking
9 voucher rejections (VOUCHER_ALREADY_USED)
voucher_redemptions table has exactly 1 row for this user
ticket inventory decremented exactly once
```

### Cancellation race

```bash
npm run test:concurrency:cancel
```

Scenario:

```text
10 concurrent cancellation requests
same booking
```

Expected invariant:

```text
all identical cancellation requests are safe
1 real state transition
inventory restored exactly once
1 cancellation history row
```

### Run all concurrency tests

If configured:

```bash
npm run test:concurrency
```

---

## Database Correctness Strategy

The implementation deliberately relies on database correctness primitives instead of application-only checks.

Key mechanisms:

```text
conditional UPDATE
database transactions
row-level locking
unique constraints
check constraints
foreign keys
idempotency record locking
```

Application-level reads are useful for clear validation messages, but the database is treated as the final authority under concurrency.

---

## Money Handling

Money is stored using decimal database types.

The backend uses Prisma `Decimal`.

JavaScript floating-point arithmetic is not used for booking totals or voucher discounts.

Money is serialized to JSON as strings.

Example:

```json
{
  "unitPrice": "800000.00",
  "subtotalAmount": "1600000.00",
  "discountAmount": "160000.00",
  "totalAmount": "1440000.00"
}
```

---

## Identifier Handling

Database IDs use MySQL `BIGINT`.

Because JavaScript `number` cannot safely represent every 64-bit integer, IDs are serialized as JSON strings.

Example:

```json
{
  "id": "123"
}
```

---

## Scope and Assumptions

### Authentication

`X-User-Id` is an assessment-only identity mechanism.

Production authentication such as OAuth, JWT, session management, password handling, and RBAC infrastructure is out of scope.

### One category per booking

A booking represents one ticket category and one quantity.

A customer can create multiple bookings if they need multiple categories.

### Maximum quantity

A single booking may request at most 10 tickets.

### Voucher usage

A booking supports at most one voucher.

A voucher can be used at most once by the same user.

Voucher quota is consumed when a booking is successfully created.

Voucher quota is not restored on cancellation or expiration.

### Payment

A real payment gateway is not implemented.

Bookings initially enter:

```text
PENDING_PAYMENT
```

Operations may transition them to:

```text
CONFIRMED
CANCELLED
EXPIRED
```

### Automatic expiration

A background expiration worker is not implemented in the current scope.

The `EXPIRED` transition is supported by the booking state machine and operations API.

### Distributed infrastructure

Redis, message queues, and microservices were intentionally not introduced.

For the current traffic assumptions and assessment scope, MySQL transactions provide the primary consistency guarantees with significantly lower operational complexity.

---

## Known Limitations

This submission is not intended to be production-ready.

Important production improvements would include:

- real authentication and authorization;
- payment gateway integration;
- automatic booking expiration workers;
- rate limiting;
- distributed observability and metrics;
- secrets management;
- stronger deployment configuration;
- database replicas / failover;
- load testing in a production-like environment;
- distributed caching where measurements justify it;
- async events for downstream notifications;
- automated voucher administration APIs if required by product scope.

---

## Design Documentation

Additional design documents are available under:

```text
docs/
```

They cover:

- scope and assumptions;
- system design;
- database design;
- booking workflow;
- API design.

---

## Development Safety

The seed script refuses to run when:

```env
NODE_ENV=production
```

because the development seed deletes and recreates fixture data.

Do not run the deterministic seed against a production database.

---

## Useful Commands

```bash
# Install
npm install

# Start MySQL
docker compose up -d

# Stop MySQL
docker compose down

# Generate Prisma Client
npx prisma generate

# Apply migrations
npx prisma migrate deploy

# Development migrations
npx prisma migrate dev

# Seed
npx prisma db seed

# Development server
npm run start:dev

# Build
npm run build

# Unit tests
npm test

# Concurrency tests
npm run test:concurrency:inventory
npm run test:concurrency:idempotency
npm run test:concurrency:voucher
npm run test:concurrency:voucher-abuse
npm run test:concurrency:cancel
```

---

## Reviewer Quick Start

For the fastest local review:

```bash
npm install
docker compose up -d
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
npm run start:dev
```

Then open:

```text
Swagger:
http://localhost:3000/docs

Health:
http://localhost:3000/health
```

Use:

```text
Operator X-User-Id: 1001
Customer X-User-Id: 2001
```

For deterministic API workflows, import the Postman collection and local environment from `postman/`.

For concurrency correctness, run the scripts under `scripts/concurrency/`.
