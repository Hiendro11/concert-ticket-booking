01 — System Design

1. Purpose

This document describes the proposed backend architecture for the Concert Ticket Booking Platform.

The design is optimized for the assessment's highest-risk concerns:

Prevent ticket overselling.

Prevent duplicate bookings caused by retries.

Prevent voucher over-redemption / abuse.

Keep booking behavior correct during flash-sale traffic spikes.

Support both customer-facing booking flows and internal operation workflows.

Keep the system simple enough to implement, test, explain, and operate within the assessment scope.

The design intentionally favors correctness, clear transaction boundaries, and explainability over infrastructure complexity.

2. Architecture Summary

Architecture style

The system uses a:

Modular Monolith

implemented with:

Node.js

TypeScript

NestJS

MySQL 8 / InnoDB

REST APIs

Swagger / OpenAPI

Docker Compose

High-level architecture

flowchart TB
    C[Customer Client]
    O[Operation Dashboard / Operator]
    API[NestJS Backend API]
    CM[Concerts Module]
    BM[Bookings Module]
    VM[Vouchers Module]
    OM[Operations Module]
    DB[(MySQL 8 / InnoDB)]

    C -->|REST/HTTP| API
    O -->|REST/HTTP| API
    API --> CM
    API --> BM
    API --> VM
    API --> OM
    CM --> DB
    BM --> DB
    VM --> DB
    OM --> CM
    OM --> BM
    OM --> VM

Key principle

The application is deployed as one backend service, but the code is separated into explicit business modules.

This provides:

Simple deployment.

Simple transaction management.

Clear business boundaries.

Low operational overhead.

A straightforward path to future service extraction if required.

3. Why Modular Monolith

The expected traffic in the assessment does not require a distributed microservice architecture.

The main technical risk is not raw request volume; it is maintaining correct business state when multiple users compete for limited resources.

For that reason, a modular monolith is preferred over microservices.

Benefits

Database transactions remain simple.

Inventory and voucher consistency are easier to guarantee.

Fewer network failure modes.

Easier local setup and reviewer reproduction.

Easier integration testing.

Faster development within the assignment time limit.

Lower operational complexity.

Trade-offs

Modules cannot be deployed independently.

Modules share the same application runtime.

MySQL remains a shared dependency.

Independent scaling per module is not available initially.

These trade-offs are acceptable for the current traffic profile and assignment scope.

4. Technology Decisions

Area

Technology

Reason

Runtime

Node.js

Strong ecosystem, efficient I/O, suitable for REST backend workloads

Language

TypeScript

Type safety, maintainability, good NestJS support

Framework

NestJS

Clear module structure, dependency injection, validation, testing support

Database

MySQL 8

Mature relational database with ACID transactions and locking

Storage Engine

InnoDB

Transaction support, row-level locking, foreign keys

API

REST

Simple, conventional, easy to document and test

API Docs

Swagger/OpenAPI

Reviewer-friendly API documentation

Unit Tests

Jest

Native NestJS ecosystem support

Integration/API Tests

Supertest

HTTP-level testing of NestJS APIs

Load/Concurrency Tests

k6 / dedicated scripts

Reproduce flash-sale concurrency scenarios

Local Environment

Docker Compose

Reproducible local setup

API Collection

Postman

Easy manual validation by reviewer

5. Why MySQL Is the Source of Truth

The system treats MySQL/InnoDB as the authoritative source of truth for:

Ticket inventory.

Booking state.

Voucher quota.

Voucher redemption.

Idempotency state.

The system does not use process memory or Redis as the authoritative inventory source.

Reason

The critical business invariants require transactional consistency.

MySQL provides:

ACID transactions.

Row-level locking.

Conditional updates.

Unique constraints.

Rollbacks.

Referential integrity.

This is sufficient for the workload described in the assessment and avoids introducing additional consistency problems.

6. Module Boundaries

src/
├── common/
├── database/
└── modules/
    ├── concerts/
    ├── bookings/
    ├── vouchers/
    └── operations/

concerts

Owns:

Concert information and lifecycle.

Ticket categories.

Ticket pricing.

Ticket inventory.

Publish rules.

Customer concert browsing.

Main domain objects:

Concert
TicketCategory

bookings

Owns:

Booking creation.

Booking status.

Idempotency.

Booking transaction orchestration.

Booking state machine.

Customer and operation booking lookup.

Main domain objects:

Booking
IdempotencyRecord

vouchers

Owns:

Voucher validation.

Voucher quota.

Discount calculation.

Per-user redemption rule.

Voucher redemption history.

Main domain objects:

Voucher
VoucherRedemption

operations

Exposes operator-facing APIs but does not duplicate business logic.

Examples:

OperationsController
    ↓
BookingsService.changeStatus()

OperationsController
    ↓
ConcertsService.publishConcert()

OperationsController
    ↓
VouchersService.createVoucher()

7. Request Layering

The intended request flow is:

HTTP Request
    ↓
Controller
    ↓
DTO validation
    ↓
Application / Service
    ↓
Business rules
    ↓
Repository / Database access
    ↓
MySQL

Controllers should remain thin and should not own:

Inventory calculations.

Voucher quota logic.

Booking state transition rules.

Transaction orchestration.

8. Customer Booking Flow

The booking API is the system's critical path.

sequenceDiagram
    participant C as Customer
    participant API as Booking API
    participant DB as MySQL

    C->>API: POST /bookings + Idempotency-Key
    API->>API: Validate request
    API->>DB: Resolve idempotency state
    API->>DB: BEGIN TRANSACTION
    API->>DB: Validate concert/category
    API->>DB: Reserve inventory atomically

    alt Voucher provided
        API->>DB: Validate/reserve voucher quota
        API->>DB: Create voucher redemption
    end

    API->>DB: Create booking
    API->>DB: Store idempotency result
    API->>DB: COMMIT
    API-->>C: Booking response

If any required step fails:

ROLLBACK

9. Inventory Reservation Strategy

A naive implementation is unsafe:

SELECT available_quantity
if enough:
    UPDATE available_quantity

Two concurrent requests may both observe the same inventory before either writes.

The preferred approach is a database-level conditional update:

UPDATE ticket_categories
SET available_quantity = available_quantity - :quantity
WHERE id = :ticketCategoryId
  AND available_quantity >= :quantity;

Then:

affectedRows = 1
→ reservation succeeded

affectedRows = 0
→ insufficient inventory / booking cannot continue

Why this approach

Check and write happen atomically in MySQL.

No application-level read/write race window.

MySQL remains authoritative.

It is sufficient for the assessment workload.

It is easy to verify with concurrency tests.

10. Voucher Reservation Strategy

Voucher quota follows the same principle.

Conceptually:

UPDATE vouchers
SET used_count = used_count + 1
WHERE id = :voucherId
  AND status = 'ACTIVE'
  AND used_count < usage_limit;

If no row is updated, the voucher cannot be redeemed.

A separate voucher_redemptions table records successful usage.

For the current one-use-per-user assumption, the database should enforce a unique constraint similar to:

UNIQUE(voucher_id, user_id)

11. Transaction Boundary

The booking transaction should remain short and contain only database-critical work.

Conceptually:

BEGIN

1. Resolve idempotency state
2. Validate bookable concert/category
3. Atomically reserve inventory
4. Atomically reserve voucher quota if needed
5. Insert voucher redemption if needed
6. Insert booking
7. Store idempotency result

COMMIT

On any required failure:

ROLLBACK

Rule

Do not place slow network calls inside the critical transaction.

Examples:

email
SMS
analytics
payment provider call
external webhook

12. Idempotency Design

A client can retry when:

The network times out.

The response is lost.

A mobile client retries automatically.

A proxy retries the request.

Booking creation therefore supports:

POST /api/v1/bookings
Idempotency-Key: <client-generated-key>

Conceptual record:

idempotency_key
user_id
request_hash
booking_id
status
created_at
updated_at

Expected behavior:

First request

new key
→ process booking
→ store result

Same key + same payload

return same logical booking result

Same key + different payload

reject as IDEMPOTENCY_KEY_CONFLICT

Database protection:

UNIQUE(user_id, idempotency_key)

Application-level checking alone is not enough under concurrency.

13. Booking State Machine

stateDiagram-v2
    [*] --> PENDING_PAYMENT
    PENDING_PAYMENT --> CONFIRMED
    PENDING_PAYMENT --> CANCELLED
    PENDING_PAYMENT --> EXPIRED
    CONFIRMED --> [*]
    CANCELLED --> [*]
    EXPIRED --> [*]

Allowed transitions:

PENDING_PAYMENT -> CONFIRMED
PENDING_PAYMENT -> CANCELLED
PENDING_PAYMENT -> EXPIRED

Invalid examples:

CONFIRMED -> PENDING_PAYMENT
CANCELLED -> CONFIRMED
EXPIRED -> CONFIRMED

The bookings module validates transitions before persistence.

14. Error Model

Expected business error codes include:

CONCERT_NOT_FOUND
CONCERT_NOT_PUBLISHED
TICKET_CATEGORY_NOT_FOUND
INVALID_TICKET_QUANTITY
INSUFFICIENT_TICKET_INVENTORY

VOUCHER_NOT_FOUND
VOUCHER_INACTIVE
VOUCHER_EXPIRED
VOUCHER_USAGE_LIMIT_REACHED
VOUCHER_ALREADY_USED

IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_CONFLICT

BOOKING_NOT_FOUND
INVALID_BOOKING_STATUS_TRANSITION

Recommended response shape:

{
  "statusCode": 409,
  "code": "INSUFFICIENT_TICKET_INVENTORY",
  "message": "Not enough tickets are available for this category.",
  "timestamp": "2026-08-08T12:00:00.000Z",
  "path": "/api/v1/bookings"
}

Exact contracts are finalized in the API design document.

15. API Boundary

Customer APIs

GET  /api/v1/concerts
GET  /api/v1/concerts/:id

POST /api/v1/bookings
GET  /api/v1/bookings/:id
GET  /api/v1/me/bookings

Operation APIs

POST  /api/v1/ops/concerts
POST  /api/v1/ops/concerts/:id/ticket-categories
POST  /api/v1/ops/concerts/:id/publish

GET   /api/v1/ops/concerts/:id/inventory

GET   /api/v1/ops/bookings
GET   /api/v1/ops/bookings/:id
PATCH /api/v1/ops/bookings/:id/status

POST  /api/v1/ops/vouchers

16. Capacity Reasoning

Assessment traffic:

~50,000 users
peak ~300–500 booking requests/minute

500 booking requests/minute is approximately:

8.3 booking requests/second on average

Flash-sale traffic may be bursty, but this does not justify starting with a complex distributed architecture.

The initial design relies on:

Stateless NestJS API.

MySQL connection pooling.

Short transactions.

Correct indexes.

Atomic inventory updates.

Atomic voucher quota updates.

Unique constraints.

Bounded request validation.

17. Stateless Application Design

Critical state must not live only in Node.js process memory.

Do not keep authoritative values such as:

ticket inventory
voucher usage
booking state

in application memory.

This allows future horizontal scaling:

Backend #1
Backend #2
Backend #3
       ↓
     MySQL

18. Scaling Strategy

Stage 1 — Current assessment

Stateless NestJS API
        ↓
MySQL

Use:

proper indexes

connection pooling

short transactions

conditional updates

Stage 2 — Read traffic grows

Potential additions:

CDN / cache
Redis for concert catalog caching
rate limiting

Redis remains non-authoritative for inventory.

Stage 3 — Database read pressure grows

Potential additions:

read replicas
query optimization
index tuning
read/write separation

Stage 4 — Extreme flash-sale scale

Only when justified:

waiting room
queue-based admission
inventory partitioning
service extraction
specialized reservation infrastructure

19. Why Redis Is Not Required Initially

Redis is useful, but using it as authoritative inventory would introduce additional consistency questions:

How are Redis and MySQL synchronized?
What if one write succeeds and the other fails?
Which datastore is authoritative?
How is recovery handled?

The assessment workload does not require solving these distributed consistency problems.

Possible future Redis uses:

Concert catalog caching.

Rate limiting.

Waiting-room support.

Temporary non-authoritative counters.

20. Why Kafka / RabbitMQ Is Not Required Initially

The critical booking path requires synchronous correctness.

A message broker does not simplify:

reserve inventory
reserve voucher
create booking

and would add:

message delivery semantics

retries

duplicate handling

consumer failures

operational complexity

A queue may be useful later for asynchronous side effects such as notifications or analytics.

21. Why Microservices Are Not Required Initially

Splitting the system into separate services such as:

Booking Service
Inventory Service
Voucher Service
Concert Service

would turn a straightforward ACID transaction into a distributed consistency problem.

That introduces:

sagas
compensation
network failure
service retries
duplicate messages
partial failure

The modular monolith keeps business boundaries clear without creating those failure modes.

22. Reliability Principles

R-01 — Fail closed on inventory uncertainty

If inventory cannot be safely reserved, reject the booking.

R-02 — Database constraints backstop application logic

Critical uniqueness rules should exist in MySQL.

R-03 — Keep transactions short

Do not hold locks during unrelated work.

R-04 — Retried booking requests are safe

Idempotency is part of the booking contract.

R-05 — Partial business state is forbidden

Booking creation either commits fully or rolls back.

R-06 — Business failures are explicit

Expected failures should return stable business error codes.

23. Observability

Production monitoring infrastructure is outside scope, but useful logs should exist for:

booking created
inventory exhausted
idempotent retry detected
idempotency conflict
voucher rejected
voucher quota exhausted
invalid booking status transition
transaction rollback
unexpected database error

Useful correlation fields:

requestId
bookingId
concertId
ticketCategoryId
idempotencyKey reference/hash

Do not log sensitive data unnecessarily.

24. Security Scope

Full production authentication and RBAC are outside the core assessment scope.

The API is still logically separated:

/api/v1/*
/api/v1/ops/*

Basic security practices:

Validate all DTOs.

Reject unexpected input.

Never trust client-provided price.

Calculate discounts on the server.

Never trust client-provided booking status.

Use parameterized ORM/database queries.

Keep secrets in environment variables.

Do not commit .env.

25. Price Integrity

The client does not provide the authoritative final price.

The backend calculates:

subtotal = ticket_category.price × quantity
discount = calculateVoucherDiscount(...)
total = max(subtotal - discount, 0)

The client may identify the requested category and voucher, but trusted pricing comes from server-side data.

26. Database Constraints as Defense in Depth

Use both:

TypeScript business validation
+
MySQL constraints

Examples:

UNIQUE(user_id, idempotency_key)

UNIQUE(voucher_id, user_id)

foreign keys:
booking → user
booking → concert
booking → ticket_category
voucher_redemption → voucher
voucher_redemption → booking

Exact schema is defined in 02-database-design.md.

27. Critical Failure Scenarios

Scenario 1 — Two users attempt the final ticket

available_quantity = 1
Request A
Request B

Expected:

exactly one succeeds
exactly one fails
inventory = 0

Scenario 2 — Client times out after booking commits

server commits booking
response is lost
client retries

Expected:

same idempotency key
→ same logical booking result
→ no second inventory deduction

Scenario 3 — Ticket reservation succeeds but voucher fails

Expected:

transaction rollback
inventory unchanged
booking not created
voucher usage unchanged

Scenario 4 — Many users compete for final voucher quota

Expected:

successful redemption count never exceeds usage_limit

Scenario 5 — Operator submits invalid status transition

Expected:

request rejected
booking status unchanged

Scenario 6 — Database is unavailable

Expected:

booking request fails
no in-memory success is trusted
client can safely retry using the same idempotency key

28. Testing Strategy

Unit tests

Focus on:

voucher validation
discount calculation
booking state transitions
business validation

Integration tests

Focus on:

booking transaction
rollback behavior
unique constraints
idempotency
API error mapping

Concurrency tests

Focus on:

overselling prevention
same idempotency key concurrency
voucher quota concurrency
per-user voucher concurrency

Load test

Use k6 or equivalent.

Primary success metric:

Business invariants remain correct under load.

Not maximum possible RPS.

29. Proposed Code Structure

src/
├── common/
│   ├── constants/
│   ├── decorators/
│   ├── errors/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── utils/
│
├── database/
│   └── ...
│
├── modules/
│   ├── concerts/
│   │   ├── controllers/
│   │   ├── dto/
│   │   ├── repositories/
│   │   ├── services/
│   │   └── concerts.module.ts
│   │
│   ├── bookings/
│   │   ├── controllers/
│   │   ├── dto/
│   │   ├── repositories/
│   │   ├── services/
│   │   └── bookings.module.ts
│   │
│   ├── vouchers/
│   │   ├── controllers/
│   │   ├── dto/
│   │   ├── repositories/
│   │   ├── services/
│   │   └── vouchers.module.ts
│   │
│   └── operations/
│       ├── controllers/
│       ├── dto/
│       └── operations.module.ts
│
├── app.module.ts
└── main.ts

Do not create empty abstractions in advance. Add folders when real code requires them.

30. Dependency Direction

flowchart LR
    OP[Operations]
    BK[Bookings]
    CO[Concerts]
    VO[Vouchers]
    DB[(Database)]

    OP --> BK
    OP --> CO
    OP --> VO
    BK --> CO
    BK --> VO
    BK --> DB
    CO --> DB
    VO --> DB

Avoid circular dependencies.

If a circular dependency appears, reconsider business ownership before using framework workarounds.

31. Codebase Principles

Principle 1 — Thin controllers

Business logic belongs in services/use cases.

Principle 2 — Database constraints protect critical rules

Do not rely only on pre-check queries.

Principle 3 — Prefer explicit code over unnecessary abstraction

Explainability matters more than architectural decoration.

Principle 4 — Do not abstract without a real use case

Avoid generic repository/framework layers only for appearance.

Principle 5 — Optimize the critical booking path first

Booking correctness receives the most engineering effort.

32. Local Deployment Model

flowchart LR
    DEV[Developer / Reviewer]
    API[NestJS API]
    DB[(MySQL 8)]

    DEV -->|localhost REST| API
    API --> DB

Docker Compose should provide at minimum:

app
mysql

The reviewer should be able to start the project from a clean environment using documented commands.

33. Environment Configuration

Expected variables may include:

NODE_ENV
PORT

DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD

MAX_TICKETS_PER_BOOKING

Exact names can be finalized during implementation.

Commit a safe .env.example, not the real .env.

34. Health Check

A lightweight endpoint is useful:

GET /health

Example:

{
  "status": "ok"
}

Database readiness may be added if implemented cleanly.

35. API Versioning

Use:

/api/v1

This keeps API evolution explicit with little added complexity.

36. Pagination

List APIs should use bounded pagination.

Examples:

GET /api/v1/concerts?page=1&limit=20
GET /api/v1/ops/bookings?page=1&limit=20

The server should enforce a maximum limit.

37. Indexing Direction

Detailed indexes belong in 02-database-design.md.

Expected critical access paths include:

concert by status/start time
ticket category by concert
booking by customer
booking by status
voucher by code
voucher redemption by voucher + user
idempotency by user + key

Indexes should follow actual query patterns.

38. Intentional Non-Goals

The initial system does not attempt to implement:

microservices
Kubernetes
Kafka/RabbitMQ
multi-region writes
distributed transactions
seat-level locking
real payment gateway
refunds
waiting room
fraud ML
full IAM
email/SMS

These are excluded so the implementation can focus on the assessment's core backend risks.

39. Future Evolution

Possible future path:

Modular Monolith + MySQL
        ↓
Redis caching / rate limiting
        ↓
read replicas / stronger observability
        ↓
queue for asynchronous side effects
        ↓
split modules only when scaling or team ownership justifies it

Service extraction should be driven by real bottlenecks.

40. Key Architecture Decisions

ADR-01 — Modular Monolith

Decision: Use a modular monolith.

Reason: Current traffic does not justify distributed-system complexity.

Trade-off: Modules cannot be deployed or scaled independently.

ADR-02 — MySQL/InnoDB as authoritative store

Decision: Store inventory, booking state, voucher quota, redemption, and idempotency in MySQL.

Reason: These entities require transactional consistency.

Trade-off: The primary database is a critical dependency.

ADR-03 — Atomic inventory update

Decision: Use a conditional database update for inventory reservation.

Reason: Avoid read-then-write race conditions.

Trade-off: A very hot inventory row can become a contention point at much larger scale.

ADR-04 — Idempotency-Key for booking creation

Decision: Support a client-provided idempotency key.

Reason: Network retries must not create duplicate bookings.

Trade-off: Requires persistent idempotency records and conflict handling.

ADR-05 — No Redis distributed lock initially

Decision: Do not use Redis as a locking/inventory authority.

Reason: MySQL is sufficient for the stated workload and keeps one source of truth.

Trade-off: At extreme future scale, another reservation strategy may be required.

ADR-06 — No microservices initially

Decision: Keep booking, inventory, vouchers, and concerts in one deployable backend.

Reason: Preserves simple ACID transaction boundaries.

Trade-off: Independent module deployment is deferred.

41. Architecture Guarantees

The design aims to make these statements demonstrably true:

1. Ticket inventory never becomes negative.

2. Concurrent booking requests cannot reserve
   more tickets than are available.

3. Retrying the same logical booking request
   does not create duplicate bookings.

4. Voucher quota cannot be exceeded by
   concurrent redemptions.

5. Booking creation is atomic.

6. Invalid booking status transitions are rejected.

7. Critical state is not stored only in
   Node.js process memory.

8. The system can be run and explained
   without distributed infrastructure.

42. Definition of Done for System Design

This architecture is considered correctly reflected in the implementation when:

NestJS modules match the documented business boundaries.

MySQL/InnoDB stores critical state.

Booking creation uses an explicit transaction.

Ticket reservation is concurrency-safe.

Voucher quota enforcement is concurrency-safe.

Idempotency is database-protected.

Controllers remain thin.

Business errors are explicit.

Concurrency tests prove key invariants.

Local setup is reproducible using Docker Compose.

Swagger and Postman expose usable APIs.

Any implementation difference from this document is documented rather than silently diverging.

43. Final Design Statement

The architecture follows one main principle:

For a limited-inventory flash-sale system, correctness under concurrency is more valuable than architectural complexity.

The system therefore uses:

Modular Monolith
+ Node.js / TypeScript / NestJS
+ MySQL 8 / InnoDB
+ short ACID transactions
+ atomic inventory updates
+ database constraints
+ idempotent booking creation
+ explicit business workflows
+ concurrency tests

This directly addresses the critical business risks while keeping the solution maintainable, testable, explainable, and appropriate for the assessment scope.