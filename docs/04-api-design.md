# 04 — API Design

## 1. Purpose

This document defines the REST API contract for the **Concert Ticket Booking Platform**.

The API is intentionally small and focused on the workflows required by the assessment:

- Customer concert browsing.
- Ticket category/price viewing.
- Ticket reservation.
- Voucher application.
- Booking status tracking.
- Internal operation workflows for concerts, inventory, bookings, vouchers, and manual booking status updates.

The API is designed to make the important backend guarantees explicit:

```text
no overselling
safe booking retries
voucher quota protection
server-controlled pricing
explicit booking state transitions
predictable business errors
```

The final implementation should remain aligned with this contract. If implementation details change, this document should be updated rather than silently diverging.

---

# 2. API Style

The backend uses:

```text
REST
JSON
HTTP
Swagger / OpenAPI
```

Base path:

```text
/api/v1
```

Example:

```text
http://localhost:3000/api/v1/concerts
```

---

# 3. API Groups

The API is divided into three logical groups:

```text
Customer APIs
Operation APIs
System APIs
```

### Customer APIs

```text
/api/v1/concerts
/api/v1/bookings
/api/v1/me/bookings
```

### Operation APIs

```text
/api/v1/ops/*
```

### System APIs

```text
/health
```

---

# 4. Authentication Scope

A full production authentication system is outside the core assessment scope.

However, the API must still distinguish:

```text
CUSTOMER
OPERATOR
```

For the assessment, a simplified development/test identity mechanism may be used.

Recommended simple approach:

```http
X-User-Id: 1
```

The backend resolves that user from the database.

For operation endpoints, the resolved user must have:

```text
role = OPERATOR
```

This is intentionally simple and must be documented clearly as a test-only authentication substitute.

## Important

Do not pretend this header is production-grade authentication.

The README should explicitly state:

> `X-User-Id` is used only to simulate authenticated identities for the technical assessment. A production system would replace this with proper authentication and authorization.

---

# 5. Common Headers

## Customer/operation identity

```http
X-User-Id: 1
```

Required for endpoints that act on behalf of a customer/operator.

---

## Booking idempotency

```http
Idempotency-Key: 98c72e41-71aa-4dcc-a68d-0247f2dfc130
```

Required for:

```text
POST /api/v1/bookings
```

Constraints:

```text
required
non-empty
maximum length: 128
treated as exact token
```

---

## Content type

For JSON requests:

```http
Content-Type: application/json
```

---

# 6. Standard Success Response Policy

The API does not need a generic wrapper around every success response.

Preferred:

```json
{
  "id": 123,
  "status": "PENDING_PAYMENT"
}
```

rather than:

```json
{
  "success": true,
  "data": {
    "id": 123
  }
}
```

### Reason

A thin response shape is simpler and more idiomatic for REST.

List endpoints may return metadata:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 100
}
```

---

# 7. Standard Error Response

All expected API errors should use a stable structure.

```json
{
  "statusCode": 409,
  "code": "INSUFFICIENT_TICKET_INVENTORY",
  "message": "Not enough tickets are available for this category.",
  "timestamp": "2026-08-08T06:00:00.000Z",
  "path": "/api/v1/bookings",
  "requestId": "req-abc123"
}
```

## Fields

| Field | Type | Description |
|---|---|---|
| `statusCode` | number | HTTP status |
| `code` | string | Stable machine-readable business/system code |
| `message` | string | Human-readable explanation |
| `timestamp` | string | ISO 8601 UTC |
| `path` | string | Request path |
| `requestId` | string | Correlation identifier |

Validation errors may additionally include:

```json
{
  "details": [
    {
      "field": "quantity",
      "message": "quantity must not be greater than 10"
    }
  ]
}
```

---

# 8. HTTP Status Strategy

| Situation | Status |
|---|---:|
| Successful read | `200 OK` |
| Successful creation | `201 Created` |
| Successful update | `200 OK` |
| Invalid input | `400 Bad Request` |
| Missing simulated identity | `401 Unauthorized` |
| Customer calls operation API | `403 Forbidden` |
| Resource missing | `404 Not Found` |
| Business/state/concurrency conflict | `409 Conflict` |
| Unexpected application error | `500 Internal Server Error` |
| Temporary database unavailable | `503 Service Unavailable` |

---

# 9. Pagination

List APIs use bounded page pagination for the assessment.

Query parameters:

```text
page
limit
```

Defaults:

```text
page = 1
limit = 20
```

Validation:

```text
page >= 1
1 <= limit <= 100
```

Example:

```http
GET /api/v1/concerts?page=1&limit=20
```

Response:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 0
}
```

For larger production datasets, cursor pagination can replace page/offset pagination later.

---

# 10. Date and Time Format

All API timestamps are returned as ISO 8601 UTC strings.

Example:

```text
2026-09-07T12:30:00.000Z
```

The client must not send local-time strings without timezone information.

---

# 11. Money Format

Money is stored in MySQL as `DECIMAL`.

In JSON responses, money should be serialized as strings to avoid accidental floating-point precision issues.

Example:

```json
{
  "unitPrice": "1000000.00",
  "subtotal": "2000000.00",
  "discountAmount": "200000.00",
  "totalAmount": "1800000.00"
}
```

---

# 12. Public Concert Model

Conceptual response shape:

```json
{
  "id": 1,
  "name": "GEEK Music Night",
  "venue": "Ho Chi Minh City",
  "description": "Launch week concert",
  "startsAt": "2026-09-20T12:00:00.000Z",
  "status": "PUBLISHED"
}
```

Customer APIs should only expose published concerts.

---

# 13. Ticket Category Model

Conceptual response:

```json
{
  "id": 11,
  "concertId": 1,
  "name": "VIP",
  "price": "2000000.00",
  "availableQuantity": 20
}
```

### Important

`availableQuantity` is informational.

The value shown to the client is **not a reservation guarantee**.

Actual reservation availability is decided atomically when the booking request executes.

---

# 14. Booking Model

Conceptual response:

```json
{
  "id": 123,
  "userId": 2,
  "concertId": 1,
  "ticketCategoryId": 11,
  "quantity": 2,
  "unitPrice": "2000000.00",
  "subtotal": "4000000.00",
  "discountAmount": "400000.00",
  "totalAmount": "3600000.00",
  "status": "PENDING_PAYMENT",
  "expiresAt": "2026-08-08T06:30:00.000Z",
  "createdAt": "2026-08-08T06:15:00.000Z",
  "updatedAt": "2026-08-08T06:15:00.000Z"
}
```

---

# 15. Voucher Model — Operation View

Conceptual response:

```json
{
  "id": 5,
  "code": "GEEK10",
  "discountType": "PERCENTAGE",
  "discountValue": "10.00",
  "usageLimit": 100,
  "usedCount": 27,
  "status": "ACTIVE",
  "startsAt": "2026-09-01T00:00:00.000Z",
  "endsAt": "2026-09-30T23:59:59.000Z"
}
```

---

# 16. CUSTOMER — List Published Concerts

```http
GET /api/v1/concerts
```

## Query parameters

```text
page
limit
from
```

Possible request:

```http
GET /api/v1/concerts?page=1&limit=20&from=2026-09-01T00:00:00.000Z
```

## Behavior

Return only:

```text
status = PUBLISHED
```

Optionally filter concerts beginning on/after `from`.

Sort:

```text
startsAt ASC
id ASC
```

## Response — 200

```json
{
  "items": [
    {
      "id": 1,
      "name": "GEEK Music Night",
      "venue": "Ho Chi Minh City",
      "description": "Launch week concert",
      "startsAt": "2026-09-20T12:00:00.000Z",
      "status": "PUBLISHED"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

## Errors

```text
400 INVALID_PAGINATION
400 INVALID_DATE_FILTER
```

---

# 17. CUSTOMER — Get Concert Detail

```http
GET /api/v1/concerts/:concertId
```

Example:

```http
GET /api/v1/concerts/1
```

## Behavior

Customer can only view a published concert through this endpoint.

Include ticket categories.

## Response — 200

```json
{
  "id": 1,
  "name": "GEEK Music Night",
  "venue": "Ho Chi Minh City",
  "description": "Launch week concert",
  "startsAt": "2026-09-20T12:00:00.000Z",
  "status": "PUBLISHED",
  "ticketCategories": [
    {
      "id": 11,
      "name": "VIP",
      "price": "2000000.00",
      "availableQuantity": 20
    },
    {
      "id": 12,
      "name": "Standard",
      "price": "800000.00",
      "availableQuantity": 100
    }
  ]
}
```

## Errors

```text
404 CONCERT_NOT_FOUND
```

A draft/cancelled concert can be treated as not publicly available.

---

# 18. CUSTOMER — Create Booking

This is the critical endpoint.

```http
POST /api/v1/bookings
```

Required headers:

```http
X-User-Id: 2
Idempotency-Key: 98c72e41-71aa-4dcc-a68d-0247f2dfc130
Content-Type: application/json
```

## Request body

```json
{
  "concertId": 1,
  "ticketCategoryId": 11,
  "quantity": 2,
  "voucherCode": "GEEK10"
}
```

`voucherCode` is optional.

Without voucher:

```json
{
  "concertId": 1,
  "ticketCategoryId": 11,
  "quantity": 2
}
```

---

# 19. Create Booking DTO

Conceptual validation:

```text
concertId:
- required
- positive integer

ticketCategoryId:
- required
- positive integer

quantity:
- required
- integer
- min 1
- max 10

voucherCode:
- optional
- string
- trim
- max length 64
- normalize uppercase
```

Unknown fields should be rejected.

Recommended NestJS validation configuration:

```text
whitelist = true
forbidNonWhitelisted = true
transform = true
```

---

# 20. Create Booking — Server Behavior

The server must:

```text
1. Validate request.
2. Validate X-User-Id.
3. Validate Idempotency-Key.
4. Normalize semantic input.
5. Calculate request hash.
6. Execute the booking transaction.
7. Resolve idempotency.
8. Validate concert/category.
9. Reserve inventory atomically.
10. Reserve voucher atomically if provided.
11. Calculate price server-side.
12. Create booking.
13. Create voucher redemption if applicable.
14. Create booking status history.
15. Complete idempotency record.
16. Commit.
17. Return booking.
```

---

# 21. Create Booking — Success

## Response — 201

```json
{
  "id": 123,
  "concertId": 1,
  "ticketCategoryId": 11,
  "quantity": 2,
  "unitPrice": "2000000.00",
  "subtotal": "4000000.00",
  "discountAmount": "400000.00",
  "totalAmount": "3600000.00",
  "status": "PENDING_PAYMENT",
  "expiresAt": "2026-08-08T06:30:00.000Z",
  "createdAt": "2026-08-08T06:15:00.000Z"
}
```

A `Location` header may optionally be returned:

```http
Location: /api/v1/bookings/123
```

---

# 22. Create Booking — Idempotent Replay

Request:

```text
same user
same Idempotency-Key
same semantic payload
```

Expected:

```text
same logical booking
no new booking
no second inventory deduction
no second voucher consumption
```

Recommended response:

```text
200 OK
```

instead of `201`, because no new resource was created by the replay.

Optional response header:

```http
Idempotent-Replay: true
```

This header is useful for debugging but not required for correctness.

---

# 23. Create Booking — Same Key Different Payload

Example:

First request:

```json
{
  "concertId": 1,
  "ticketCategoryId": 11,
  "quantity": 1
}
```

Second request:

```json
{
  "concertId": 1,
  "ticketCategoryId": 11,
  "quantity": 2
}
```

same:

```text
Idempotency-Key
```

Response:

```text
409 Conflict
```

```json
{
  "statusCode": 409,
  "code": "IDEMPOTENCY_KEY_CONFLICT",
  "message": "The idempotency key was already used with a different booking request.",
  "timestamp": "2026-08-08T06:00:00.000Z",
  "path": "/api/v1/bookings",
  "requestId": "req-abc123"
}
```

---

# 24. Create Booking — Error Cases

Possible business errors:

```text
USER_NOT_FOUND

IDEMPOTENCY_KEY_REQUIRED
INVALID_IDEMPOTENCY_KEY
IDEMPOTENCY_KEY_CONFLICT

CONCERT_NOT_FOUND
CONCERT_NOT_PUBLISHED

TICKET_CATEGORY_NOT_FOUND
TICKET_CATEGORY_NOT_IN_CONCERT
INVALID_TICKET_QUANTITY
INSUFFICIENT_TICKET_INVENTORY

VOUCHER_NOT_FOUND
VOUCHER_INACTIVE
VOUCHER_NOT_STARTED
VOUCHER_EXPIRED
VOUCHER_USAGE_LIMIT_REACHED
VOUCHER_ALREADY_USED
```

---

# 25. Booking Error Examples

## Insufficient inventory

```text
409 Conflict
```

```json
{
  "statusCode": 409,
  "code": "INSUFFICIENT_TICKET_INVENTORY",
  "message": "Not enough tickets are available for this category.",
  "timestamp": "2026-08-08T06:00:00.000Z",
  "path": "/api/v1/bookings",
  "requestId": "req-abc123"
}
```

---

## Voucher already used

```text
409 Conflict
```

```json
{
  "statusCode": 409,
  "code": "VOUCHER_ALREADY_USED",
  "message": "This voucher has already been used by the customer.",
  "timestamp": "2026-08-08T06:00:00.000Z",
  "path": "/api/v1/bookings",
  "requestId": "req-abc123"
}
```

---

# 26. Voucher Failure Policy

If a customer explicitly supplies a voucher and the voucher cannot be applied:

```text
the entire booking request fails
```

The API must not silently remove the voucher and continue at full price.

### Reason

A silent fallback can create a booking at a price the customer did not intend to accept.

---

# 27. CUSTOMER — Get Booking Detail

```http
GET /api/v1/bookings/:bookingId
```

Required:

```http
X-User-Id: 2
```

## Behavior

The booking must:

```text
exist
belong to the requesting customer
```

## Response — 200

```json
{
  "id": 123,
  "concert": {
    "id": 1,
    "name": "GEEK Music Night",
    "startsAt": "2026-09-20T12:00:00.000Z"
  },
  "ticketCategory": {
    "id": 11,
    "name": "VIP"
  },
  "quantity": 2,
  "unitPrice": "2000000.00",
  "subtotal": "4000000.00",
  "discountAmount": "400000.00",
  "totalAmount": "3600000.00",
  "status": "PENDING_PAYMENT",
  "expiresAt": "2026-08-08T06:30:00.000Z",
  "createdAt": "2026-08-08T06:15:00.000Z"
}
```

## Errors

```text
404 BOOKING_NOT_FOUND
```

For ownership protection, a booking owned by another customer may also be represented as `BOOKING_NOT_FOUND`.

---

# 28. CUSTOMER — List My Bookings

```http
GET /api/v1/me/bookings
```

Required:

```http
X-User-Id: 2
```

Query:

```text
page
limit
status
```

Example:

```http
GET /api/v1/me/bookings?page=1&limit=20&status=CONFIRMED
```

## Response — 200

```json
{
  "items": [
    {
      "id": 123,
      "concertId": 1,
      "concertName": "GEEK Music Night",
      "ticketCategoryId": 11,
      "ticketCategoryName": "VIP",
      "quantity": 2,
      "totalAmount": "3600000.00",
      "status": "CONFIRMED",
      "createdAt": "2026-08-08T06:15:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

---

# 29. Operation API Authorization

Every endpoint under:

```text
/api/v1/ops/*
```

requires a user whose database role is:

```text
OPERATOR
```

If identity missing:

```text
401
```

If user exists but is not operator:

```text
403 OPERATOR_ACCESS_REQUIRED
```

---

# 30. OPERATION — Create Concert

```http
POST /api/v1/ops/concerts
```

Required:

```http
X-User-Id: <operator-id>
```

## Request

```json
{
  "name": "GEEK Music Night",
  "venue": "Ho Chi Minh City",
  "description": "Launch week concert",
  "startsAt": "2026-09-20T12:00:00.000Z"
}
```

## Validation

```text
name required, max 200
venue required, max 255
description optional
startsAt required, valid ISO timestamp
```

## Behavior

New concert starts as:

```text
DRAFT
```

The request cannot create a concert directly as `PUBLISHED`.

## Response — 201

```json
{
  "id": 1,
  "name": "GEEK Music Night",
  "venue": "Ho Chi Minh City",
  "description": "Launch week concert",
  "startsAt": "2026-09-20T12:00:00.000Z",
  "status": "DRAFT",
  "publishedAt": null,
  "createdAt": "2026-08-08T06:00:00.000Z"
}
```

---

# 31. OPERATION — Create Ticket Category

```http
POST /api/v1/ops/concerts/:concertId/ticket-categories
```

## Request

```json
{
  "name": "VIP",
  "price": "2000000.00",
  "totalQuantity": 100
}
```

## Validation

```text
name required
price >= 0
totalQuantity > 0
```

## Behavior

Create:

```text
total_quantity = totalQuantity
available_quantity = totalQuantity
```

## Response — 201

```json
{
  "id": 11,
  "concertId": 1,
  "name": "VIP",
  "price": "2000000.00",
  "totalQuantity": 100,
  "availableQuantity": 100
}
```

## Errors

```text
404 CONCERT_NOT_FOUND
409 TICKET_CATEGORY_ALREADY_EXISTS
```

---

# 32. Ticket Category Modification Scope

Full ticket-category CRUD is not required.

The initial implementation does not need to support:

```text
delete ticket category
change total inventory after sales begin
change ticket category name
```

If price editing is added, the old booking snapshots remain unchanged.

---

# 33. OPERATION — Publish Concert

```http
POST /api/v1/ops/concerts/:concertId/publish
```

No request body required.

## Preconditions

Recommended:

```text
concert exists
concert.status == DRAFT
concert has at least one ticket category
startsAt is valid/future according to chosen business rule
```

## Response — 200

```json
{
  "id": 1,
  "status": "PUBLISHED",
  "publishedAt": "2026-08-08T06:10:00.000Z"
}
```

## Errors

```text
404 CONCERT_NOT_FOUND
409 CONCERT_ALREADY_PUBLISHED
409 CONCERT_NOT_PUBLISHABLE
```

---

# 34. OPERATION — View Concert Inventory

```http
GET /api/v1/ops/concerts/:concertId/inventory
```

## Response — 200

```json
{
  "concert": {
    "id": 1,
    "name": "GEEK Music Night",
    "status": "PUBLISHED"
  },
  "ticketCategories": [
    {
      "id": 11,
      "name": "VIP",
      "price": "2000000.00",
      "totalQuantity": 100,
      "availableQuantity": 17,
      "reservedOrSoldQuantity": 83
    }
  ]
}
```

`reservedOrSoldQuantity` can be calculated as:

```text
totalQuantity - availableQuantity
```

for this simplified model.

---

# 35. OPERATION — List Bookings

```http
GET /api/v1/ops/bookings
```

## Query parameters

```text
page
limit
status
concertId
userId
```

Example:

```http
GET /api/v1/ops/bookings?status=PENDING_PAYMENT&concertId=1&page=1&limit=20
```

## Response — 200

```json
{
  "items": [
    {
      "id": 123,
      "userId": 2,
      "concertId": 1,
      "concertName": "GEEK Music Night",
      "ticketCategoryId": 11,
      "ticketCategoryName": "VIP",
      "quantity": 2,
      "totalAmount": "3600000.00",
      "status": "PENDING_PAYMENT",
      "createdAt": "2026-08-08T06:15:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

---

# 36. OPERATION — Get Booking Detail

```http
GET /api/v1/ops/bookings/:bookingId
```

## Response — 200

```json
{
  "id": 123,
  "customer": {
    "id": 2,
    "email": "customer@example.com",
    "name": "Customer A"
  },
  "concert": {
    "id": 1,
    "name": "GEEK Music Night"
  },
  "ticketCategory": {
    "id": 11,
    "name": "VIP"
  },
  "quantity": 2,
  "unitPrice": "2000000.00",
  "subtotal": "4000000.00",
  "discountAmount": "400000.00",
  "totalAmount": "3600000.00",
  "status": "PENDING_PAYMENT",
  "voucher": {
    "code": "GEEK10",
    "discountAmount": "400000.00"
  },
  "history": [
    {
      "fromStatus": null,
      "toStatus": "PENDING_PAYMENT",
      "changedByUserId": null,
      "reason": null,
      "createdAt": "2026-08-08T06:15:00.000Z"
    }
  ],
  "createdAt": "2026-08-08T06:15:00.000Z",
  "updatedAt": "2026-08-08T06:15:00.000Z"
}
```

If no voucher:

```json
{
  "voucher": null
}
```

---

# 37. OPERATION — Change Booking Status

```http
PATCH /api/v1/ops/bookings/:bookingId/status
```

## Request

```json
{
  "status": "CONFIRMED",
  "reason": "Payment confirmed manually"
}
```

Allowed target values:

```text
CONFIRMED
CANCELLED
EXPIRED
```

## Current allowed transitions

```text
PENDING_PAYMENT -> CONFIRMED
PENDING_PAYMENT -> CANCELLED
PENDING_PAYMENT -> EXPIRED
```

---

# 38. Change Status — Transaction Behavior

The API must:

```text
BEGIN
SELECT booking FOR UPDATE
validate current -> target state
restore inventory if CANCELLED/EXPIRED
update booking
insert booking_status_history
COMMIT
```

This prevents double inventory release.

---

# 39. Change Status — Success

## Response — 200

```json
{
  "id": 123,
  "previousStatus": "PENDING_PAYMENT",
  "status": "CONFIRMED",
  "updatedAt": "2026-08-08T06:30:00.000Z"
}
```

---

# 40. Change Status — Errors

```text
404 BOOKING_NOT_FOUND
409 INVALID_BOOKING_STATUS_TRANSITION
```

Example:

```json
{
  "statusCode": 409,
  "code": "INVALID_BOOKING_STATUS_TRANSITION",
  "message": "Booking cannot transition from CONFIRMED to CANCELLED.",
  "timestamp": "2026-08-08T06:00:00.000Z",
  "path": "/api/v1/ops/bookings/123/status",
  "requestId": "req-abc123"
}
```

---

# 41. Repeated Status Request Policy

If booking is already:

```text
CONFIRMED
```

and operator submits:

```text
CONFIRMED
```

the initial implementation should return:

```text
409 INVALID_BOOKING_STATUS_TRANSITION
```

rather than silently treating it as success.

### Reason

Explicitly surfacing state mismatch makes operation behavior easier to reason about and test.

---

# 42. OPERATION — Create Voucher

```http
POST /api/v1/ops/vouchers
```

## Request — Percentage

```json
{
  "code": "GEEK10",
  "discountType": "PERCENTAGE",
  "discountValue": "10.00",
  "usageLimit": 100,
  "startsAt": "2026-09-01T00:00:00.000Z",
  "endsAt": "2026-09-30T23:59:59.000Z"
}
```

## Request — Fixed amount

```json
{
  "code": "FLASH50K",
  "discountType": "FIXED_AMOUNT",
  "discountValue": "50000.00",
  "usageLimit": 50,
  "startsAt": "2026-09-01T00:00:00.000Z",
  "endsAt": "2026-09-07T23:59:59.000Z"
}
```

---

# 43. Create Voucher Validation

```text
code:
- required
- trim
- uppercase
- max 64

discountType:
- PERCENTAGE or FIXED_AMOUNT

discountValue:
- > 0

if PERCENTAGE:
- <= 100

usageLimit:
- integer
- > 0

startsAt:
- valid date

endsAt:
- valid date
- later than startsAt
```

New voucher defaults:

```text
status = ACTIVE
usedCount = 0
```

---

# 44. Create Voucher — Response

```text
201 Created
```

```json
{
  "id": 5,
  "code": "GEEK10",
  "discountType": "PERCENTAGE",
  "discountValue": "10.00",
  "usageLimit": 100,
  "usedCount": 0,
  "status": "ACTIVE",
  "startsAt": "2026-09-01T00:00:00.000Z",
  "endsAt": "2026-09-30T23:59:59.000Z"
}
```

## Errors

```text
409 VOUCHER_CODE_ALREADY_EXISTS
400 INVALID_VOUCHER_CONFIGURATION
```

---

# 45. Voucher Management Scope

The initial operation API intentionally supports:

```text
create voucher
```

but does not need to support:

```text
update voucher
delete voucher
restore consumed voucher quota
```

This is an explicit scope decision.

Voucher seed data may also be provided for reviewer convenience.

---

# 46. SYSTEM — Health Check

```http
GET /health
```

No user header required.

## Response — 200

```json
{
  "status": "ok"
}
```

Optional database-aware response:

```json
{
  "status": "ok",
  "database": "up"
}
```

Keep the endpoint lightweight.

---

# 47. Error Code Catalog

## Identity / authorization

```text
USER_NOT_FOUND
OPERATOR_ACCESS_REQUIRED
```

## Validation

```text
VALIDATION_ERROR
INVALID_PAGINATION
INVALID_DATE_FILTER
INVALID_IDEMPOTENCY_KEY
INVALID_TICKET_QUANTITY
INVALID_VOUCHER_CONFIGURATION
```

## Concert

```text
CONCERT_NOT_FOUND
CONCERT_NOT_PUBLISHED
CONCERT_ALREADY_PUBLISHED
CONCERT_NOT_PUBLISHABLE
```

## Ticket category

```text
TICKET_CATEGORY_NOT_FOUND
TICKET_CATEGORY_NOT_IN_CONCERT
TICKET_CATEGORY_ALREADY_EXISTS
INSUFFICIENT_TICKET_INVENTORY
```

## Booking

```text
BOOKING_NOT_FOUND
INVALID_BOOKING_STATUS_TRANSITION
```

## Voucher

```text
VOUCHER_NOT_FOUND
VOUCHER_INACTIVE
VOUCHER_NOT_STARTED
VOUCHER_EXPIRED
VOUCHER_USAGE_LIMIT_REACHED
VOUCHER_ALREADY_USED
VOUCHER_CODE_ALREADY_EXISTS
```

## Idempotency

```text
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_CONFLICT
```

## Infrastructure

```text
DATABASE_UNAVAILABLE
TRANSACTION_RETRY_EXHAUSTED
INTERNAL_SERVER_ERROR
```

---

# 48. Error Mapping Table

| Code | HTTP |
|---|---:|
| `VALIDATION_ERROR` | 400 |
| `INVALID_PAGINATION` | 400 |
| `INVALID_DATE_FILTER` | 400 |
| `INVALID_IDEMPOTENCY_KEY` | 400 |
| `INVALID_TICKET_QUANTITY` | 400 |
| `INVALID_VOUCHER_CONFIGURATION` | 400 |
| `USER_NOT_FOUND` | 401/404 depending identity context |
| `OPERATOR_ACCESS_REQUIRED` | 403 |
| `CONCERT_NOT_FOUND` | 404 |
| `TICKET_CATEGORY_NOT_FOUND` | 404 |
| `BOOKING_NOT_FOUND` | 404 |
| `VOUCHER_NOT_FOUND` | 404 |
| `CONCERT_NOT_PUBLISHED` | 409 |
| `CONCERT_ALREADY_PUBLISHED` | 409 |
| `CONCERT_NOT_PUBLISHABLE` | 409 |
| `TICKET_CATEGORY_NOT_IN_CONCERT` | 409 |
| `TICKET_CATEGORY_ALREADY_EXISTS` | 409 |
| `INSUFFICIENT_TICKET_INVENTORY` | 409 |
| `VOUCHER_INACTIVE` | 409 |
| `VOUCHER_NOT_STARTED` | 409 |
| `VOUCHER_EXPIRED` | 409 |
| `VOUCHER_USAGE_LIMIT_REACHED` | 409 |
| `VOUCHER_ALREADY_USED` | 409 |
| `VOUCHER_CODE_ALREADY_EXISTS` | 409 |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 |
| `INVALID_BOOKING_STATUS_TRANSITION` | 409 |
| `DATABASE_UNAVAILABLE` | 503 |
| `TRANSACTION_RETRY_EXHAUSTED` | 503 |
| `INTERNAL_SERVER_ERROR` | 500 |

---

# 49. Validation Error Example

Request:

```json
{
  "concertId": 1,
  "ticketCategoryId": 11,
  "quantity": 100
}
```

Response:

```text
400 Bad Request
```

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": [
    {
      "field": "quantity",
      "message": "quantity must not be greater than 10"
    }
  ],
  "timestamp": "2026-08-08T06:00:00.000Z",
  "path": "/api/v1/bookings",
  "requestId": "req-abc123"
}
```

---

# 50. Request ID

Every request should have a correlation ID.

Recommended behavior:

```text
client supplies X-Request-Id
→ validate and reuse if acceptable

otherwise
→ server generates request ID
```

Response header:

```http
X-Request-Id: req-abc123
```

This is useful when reviewing concurrent booking failures.

---

# 51. Swagger Tags

Recommended Swagger tags:

```text
Health
Concerts
Bookings
Operations - Concerts
Operations - Bookings
Operations - Vouchers
```

This makes the reviewer experience cleaner.

---

# 52. Swagger Documentation Requirements

Every implemented endpoint should document:

```text
summary
description
headers
path params
query params
request DTO
success response
business errors
```

The critical booking endpoint should explicitly mention:

```text
Idempotency-Key is required
same key + same request returns same booking
same key + changed request returns conflict
```

---

# 53. Postman Collection Structure

Recommended collection:

```text
Concert Ticket Booking
├── Health
├── Customer
│   ├── List Concerts
│   ├── Get Concert
│   ├── Create Booking
│   ├── Replay Booking
│   ├── Get Booking
│   └── My Bookings
│
└── Operations
    ├── Create Concert
    ├── Create Ticket Category
    ├── Publish Concert
    ├── View Inventory
    ├── List Bookings
    ├── Get Booking
    ├── Change Booking Status
    └── Create Voucher
```

---

# 54. Postman Environment

Recommended variables:

```text
baseUrl
customerUserId
operatorUserId
concertId
ticketCategoryId
bookingId
voucherCode
idempotencyKey
```

Example:

```text
baseUrl = http://localhost:3000
```

This lets the reviewer run the collection without editing every request.

---

# 55. Important Postman Test Scenarios

Include requests demonstrating:

```text
successful booking
successful booking with voucher
same-key replay
same-key changed payload conflict
sold-out booking
expired voucher
same-user voucher reuse
invalid status transition
```

A Postman collection alone does not replace automated concurrency tests.

---

# 56. API Security Rules

Even with simplified authentication:

```text
never trust client price
never trust client discount
never trust client booking status
never trust client available inventory
validate all IDs
validate all query parameters
reject unknown request fields
```

---

# 57. Customer Price Trust Boundary

Forbidden request:

```json
{
  "ticketCategoryId": 11,
  "quantity": 2,
  "unitPrice": "1.00",
  "discountAmount": "999999999.00",
  "totalAmount": "0.00"
}
```

These fields are not part of the booking DTO.

The server uses database values.

---

# 58. Inventory Display vs. Reservation Guarantee

The customer may see:

```text
availableQuantity = 1
```

then fail when booking because another user reserved it first.

This is expected in a concurrent flash sale.

The API must not promise availability based on an earlier GET response.

---

# 59. Operation Inventory Read

`GET /ops/concerts/:id/inventory` is an observation endpoint.

It does not lock inventory or guarantee future availability.

The authoritative reservation decision still happens in:

```text
POST /bookings
```

---

# 60. Booking Expiration Scope

The booking model contains:

```text
expiresAt
```

but automatic expiration scheduling is optional in the core implementation.

If automatic expiration is not implemented, the documentation must state this clearly.

The operator status endpoint can still exercise:

```text
PENDING_PAYMENT -> EXPIRED
```

---

# 61. Suspicious Booking Scope

The assessment mentions suspicious bookings.

This API design supports investigation through:

```text
GET /api/v1/ops/bookings
GET /api/v1/ops/bookings/:id
booking history
voucher information
customer information
manual valid status changes
```

It does not implement automated fraud scoring.

---

# 62. Business Rule — One Category per Booking

The API intentionally accepts:

```text
ticketCategoryId
quantity
```

rather than:

```json
{
  "items": [
    {},
    {}
  ]
}
```

### Reason

The chosen assessment scope is:

```text
one booking = one ticket category
```

This keeps transaction logic focused on the key correctness problems.

Future versions may introduce `booking_items`.

---

# 63. Business Rule — One Voucher per Booking

The API accepts a single:

```text
voucherCode
```

not an array.

This maps directly to:

```text
0 or 1 voucher redemption per booking
```

---

# 64. Business Rule — Maximum Quantity

Initial assumption:

```text
maximum 10 tickets per booking
```

This must be enforced:

```text
DTO validation
application rule
database CHECK constraint
```

---

# 65. Business Rule — Only Published Concerts

Customer booking endpoint rejects:

```text
DRAFT
CANCELLED
```

concerts.

Example:

```text
409 CONCERT_NOT_PUBLISHED
```

---

# 66. Business Rule — Voucher Uses Server Time

Voucher validity is evaluated using server/database UTC time.

The client does not submit the authoritative "current time."

---

# 67. Business Rule — No Silent Full-Price Booking

If a requested voucher cannot be applied:

```text
booking fails
```

The customer must submit a new booking request without a voucher if they want the full-price booking.

That new attempt should use a new idempotency key because it is a different semantic request.

---

# 68. Business Rule — Price Snapshot

Every booking response uses the persisted booking price snapshot.

Do not recompute old booking totals from the current ticket-category price.

---

# 69. API Idempotency Matrix

| Same user | Same key | Same request | Expected |
|---|---|---|---|
| Yes | Yes | Yes | Same booking |
| Yes | Yes | No | `409 IDEMPOTENCY_KEY_CONFLICT` |
| Yes | No | Yes | New logical booking attempt |
| No | Yes | Yes | Independent request for other user |

---

# 70. Booking State Matrix

| Current | Requested | Result |
|---|---|---|
| `PENDING_PAYMENT` | `CONFIRMED` | Allowed |
| `PENDING_PAYMENT` | `CANCELLED` | Allowed |
| `PENDING_PAYMENT` | `EXPIRED` | Allowed |
| `CONFIRMED` | any | Rejected |
| `CANCELLED` | any | Rejected |
| `EXPIRED` | any | Rejected |

---

# 71. Inventory Effect Matrix

| Operation | Inventory effect |
|---|---|
| Booking created | `- quantity` |
| Booking confirmed | none |
| Booking cancelled | `+ quantity` |
| Booking expired | `+ quantity` |
| Failed booking transaction | rollback |
| Same-key replay | none |

---

# 72. Voucher Effect Matrix

| Operation | Voucher effect |
|---|---|
| Booking created without voucher | none |
| Booking created with voucher | `used_count + 1` |
| Voucher booking transaction fails | rollback |
| Booking confirmed | none |
| Booking cancelled | no restoration |
| Booking expired | no restoration |
| Same-key replay | none |

---

# 73. Endpoint Summary

| Method | Path | Actor | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Health check |
| GET | `/api/v1/concerts` | Customer/Public | Browse published concerts |
| GET | `/api/v1/concerts/:id` | Customer/Public | Concert + ticket categories |
| POST | `/api/v1/bookings` | Customer | Reserve tickets |
| GET | `/api/v1/bookings/:id` | Customer | Booking detail |
| GET | `/api/v1/me/bookings` | Customer | Booking history |
| POST | `/api/v1/ops/concerts` | Operator | Create concert |
| POST | `/api/v1/ops/concerts/:id/ticket-categories` | Operator | Add ticket category |
| POST | `/api/v1/ops/concerts/:id/publish` | Operator | Publish concert |
| GET | `/api/v1/ops/concerts/:id/inventory` | Operator | Inspect inventory |
| GET | `/api/v1/ops/bookings` | Operator | Monitor bookings |
| GET | `/api/v1/ops/bookings/:id` | Operator | Inspect booking |
| PATCH | `/api/v1/ops/bookings/:id/status` | Operator | Change booking status |
| POST | `/api/v1/ops/vouchers` | Operator | Create voucher |

---

# 74. Explicitly Out-of-Scope APIs

Do not build these unless time remains after critical correctness/testing is complete:

```text
DELETE /concerts
DELETE /bookings
DELETE /vouchers
PATCH /vouchers/:id
refund APIs
payment APIs
seat-selection APIs
ticket-transfer APIs
notification APIs
fraud-scoring APIs
full user-account CRUD
```

This keeps the submission risk-driven rather than CRUD-driven.

---

# 75. OpenAPI DTO Naming

Recommended NestJS DTO names:

```text
ListConcertsQueryDto
CreateBookingDto
ListMyBookingsQueryDto

CreateConcertDto
CreateTicketCategoryDto
ListOperationBookingsQueryDto
ChangeBookingStatusDto
CreateVoucherDto
```

Response DTOs can be explicit where useful:

```text
ConcertResponseDto
ConcertDetailResponseDto
BookingResponseDto
OperationBookingDetailResponseDto
VoucherResponseDto
```

---

# 76. Enum Naming

Recommended TypeScript enums:

```text
UserRole

ConcertStatus

BookingStatus

VoucherStatus

VoucherDiscountType

IdempotencyStatus
```

Example:

```ts
enum BookingStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}
```

---

# 77. Controller Boundary

Recommended controllers:

```text
ConcertsController
BookingsController

OperationsConcertsController
OperationsBookingsController
OperationsVouchersController

HealthController
```

Avoid one giant:

```text
AppController
```

containing all endpoints.

---

# 78. Service Boundary

Recommended application services:

```text
ConcertsService
BookingsService
VouchersService
```

Operations controllers should delegate to these business services rather than duplicate rules.

---

# 79. API Versioning Strategy

All business APIs use:

```text
/api/v1
```

The health endpoint may remain:

```text
/health
```

because it is operational rather than product API.

---

# 80. API Compatibility Principle

Do not expose raw database column names automatically.

Database:

```text
created_at
ticket_category_id
```

API:

```text
createdAt
ticketCategoryId
```

This prevents the HTTP contract from being tightly coupled to SQL naming.

---

# 81. Decimal Serialization

If Prisma/MySQL returns decimal objects, explicitly serialize to strings.

Never accidentally return:

```json
{
  "price": {}
}
```

or lossy JavaScript floating-point values.

---

# 82. BigInt Serialization

Because MySQL IDs may use:

```text
BIGINT
```

Node.js native `bigint` is not directly JSON-serializable.

Choose one consistent API policy.

Recommended for this assessment:

```text
serialize IDs as strings
```

Example:

```json
{
  "id": "123",
  "concertId": "1"
}
```

Alternatively, if IDs are guaranteed to remain safely below JavaScript's integer limit for the assessment, numbers can be used, but the implementation must be consistent.

### Recommended decision

Use string serialization for IDs in the final API to avoid hidden BigInt bugs.

---

# 83. Updated Example with String IDs

Recommended final style:

```json
{
  "id": "123",
  "concertId": "1",
  "ticketCategoryId": "11",
  "quantity": 2,
  "totalAmount": "3600000.00",
  "status": "PENDING_PAYMENT"
}
```

This document's earlier numeric ID examples are conceptual; implementation should standardize on one representation.

---

# 84. Request ID Validation

If accepting:

```http
X-Request-Id
```

apply a bounded length.

Do not allow an arbitrarily large header value to be logged.

---

# 85. Idempotency Key Privacy

An idempotency key is not a password, but it is client-controlled.

Avoid logging the full raw value by default.

Prefer:

```text
hash
prefix
internal idempotency record ID
```

---

# 86. API Test — Booking Creation

Automated integration test:

```text
POST /api/v1/bookings
```

Assert:

```text
201
PENDING_PAYMENT
correct price snapshot
inventory decreased
history created
idempotency completed
```

---

# 87. API Test — Idempotent Replay

First request:

```text
201
```

Second same-key/same-body request:

```text
200
same booking id
```

Database assertions:

```text
booking count unchanged
inventory unchanged after replay
voucher used_count unchanged after replay
```

---

# 88. API Test — Idempotency Conflict

Same key, changed quantity.

Assert:

```text
409
IDEMPOTENCY_KEY_CONFLICT
```

---

# 89. API Test — Sold Out

Assert:

```text
409
INSUFFICIENT_TICKET_INVENTORY
```

Database:

```text
no partial booking
```

---

# 90. API Test — Voucher Exhausted

Assert:

```text
409
VOUCHER_USAGE_LIMIT_REACHED
```

Database:

```text
ticket inventory rolled back
booking not created
```

---

# 91. API Test — Operator Role

Customer requests:

```text
POST /api/v1/ops/concerts
```

Assert:

```text
403
OPERATOR_ACCESS_REQUIRED
```

---

# 92. API Test — Invalid Transition

Confirmed booking:

```text
PATCH status -> CANCELLED
```

Assert:

```text
409
INVALID_BOOKING_STATUS_TRANSITION
```

Inventory unchanged.

---

# 93. API Test — Cancel Restores Inventory

Create booking:

```text
quantity = 2
```

Then cancel.

Assert:

```text
inventory restored by exactly 2
booking = CANCELLED
history appended
```

---

# 94. API Test — Unknown Fields

Request:

```json
{
  "concertId": 1,
  "ticketCategoryId": 11,
  "quantity": 1,
  "totalAmount": "0.00"
}
```

Assert:

```text
400 VALIDATION_ERROR
```

if `forbidNonWhitelisted = true`.

---

# 95. API Documentation Definition of Done

Swagger is complete when a reviewer can understand and call every implemented endpoint without reading the source code.

At minimum:

```text
[ ] Every endpoint is listed.
[ ] DTO schema is visible.
[ ] Header requirements are visible.
[ ] Enum values are visible.
[ ] Success examples are visible.
[ ] Important business errors are documented.
[ ] Booking idempotency behavior is documented.
[ ] Operation-role requirement is documented.
```

---

# 96. Postman Definition of Done

The Postman collection is complete when:

```text
[ ] It works with local Docker setup.
[ ] Environment variables are included.
[ ] Seeded customer/operator IDs are configured or documented.
[ ] Successful booking can be run.
[ ] Voucher booking can be run.
[ ] Idempotent replay can be demonstrated.
[ ] Operation status update can be run.
[ ] No manual database editing is required for the basic demo.
```

---

# 97. Reviewer Demo Flow

A clean demo should take only a few minutes.

Recommended order:

```text
1. GET /health

2. GET /api/v1/concerts

3. GET /api/v1/concerts/:id

4. POST /api/v1/bookings
   with Idempotency-Key

5. Replay the same request
   with the same Idempotency-Key

6. GET /api/v1/bookings/:id

7. GET /api/v1/ops/concerts/:id/inventory

8. GET /api/v1/ops/bookings/:id

9. PATCH /api/v1/ops/bookings/:id/status

10. Re-read inventory/history
```

This demonstrates the core product and engineering decisions quickly.

---

# 98. API Scope Priority

If implementation time becomes limited, prioritize endpoints in this order:

```text
P0
POST /bookings

P0
GET /concerts
GET /concerts/:id

P0
GET /bookings/:id

P0
GET /ops/bookings
GET /ops/bookings/:id
PATCH /ops/bookings/:id/status
GET /ops/concerts/:id/inventory

P1
POST /ops/concerts
POST /ops/concerts/:id/ticket-categories
POST /ops/concerts/:id/publish
POST /ops/vouchers

P1
GET /me/bookings
```

Seed data can substitute for some setup CRUD if necessary.

---

# 99. Why Booking Is P0

The assessment specifically emphasizes:

```text
overselling
duplicate retries
voucher abuse
flash-sale stability
```

All of these are concentrated in the booking flow.

Therefore:

```text
booking correctness
```

is more important than complete CRUD coverage.

---

# 100. Why Operation Status Is P0

The assessment explicitly asks for internal operation workflows including:

```text
monitor bookings
handle failed/suspicious bookings
update booking status manually
```

So the operation booking view/status workflow should be implemented rather than only customer APIs.

---

# 101. API Design Trade-offs

## Trade-off 1 — Simplified identity header

Benefit:

```text
focuses assessment effort on booking logic
easy reviewer testing
```

Cost:

```text
not production authentication
```

---

## Trade-off 2 — Page pagination

Benefit:

```text
simple
reviewer-friendly
sufficient for assessment size
```

Cost:

```text
offset pagination is less efficient at very large offsets
```

---

## Trade-off 3 — One ticket category per booking

Benefit:

```text
simple critical transaction
easy concurrency reasoning
```

Cost:

```text
cannot bundle VIP + Standard in one booking
```

---

## Trade-off 4 — Voucher failure rejects booking

Benefit:

```text
never surprises customer with higher final price
```

Cost:

```text
customer must submit another request to buy without voucher
```

---

## Trade-off 5 — String IDs

Benefit:

```text
safe with MySQL BIGINT and JSON
```

Cost:

```text
slightly less natural for consumers expecting numeric IDs
```

---

# 102. Final Endpoint Contract

The final target API surface is:

```text
GET    /health

GET    /api/v1/concerts
GET    /api/v1/concerts/:concertId

POST   /api/v1/bookings
GET    /api/v1/bookings/:bookingId
GET    /api/v1/me/bookings

POST   /api/v1/ops/concerts
POST   /api/v1/ops/concerts/:concertId/ticket-categories
POST   /api/v1/ops/concerts/:concertId/publish
GET    /api/v1/ops/concerts/:concertId/inventory

GET    /api/v1/ops/bookings
GET    /api/v1/ops/bookings/:bookingId
PATCH  /api/v1/ops/bookings/:bookingId/status

POST   /api/v1/ops/vouchers
```

---

# 103. Definition of Done

The API design is considered implemented correctly when:

```text
1. Every implemented endpoint appears in Swagger.

2. Swagger documents headers, DTOs, enums, responses,
   and key business errors.

3. POST /bookings requires Idempotency-Key.

4. Same-key/same-request replay is safe.

5. Same-key/different-request returns 409.

6. Client cannot control price, discount, inventory,
   or booking status.

7. Voucher failure does not silently create
   a full-price booking.

8. Customer cannot read another customer's booking.

9. Operation endpoints require operator role
   in the simplified assessment identity model.

10. Invalid booking status transitions return
    explicit business conflicts.

11. Pagination is bounded.

12. Money and BIGINT serialization are consistent.

13. Postman works against the local setup.

14. API integration tests cover the critical flows.

15. The API remains intentionally smaller than a
    production ticketing platform, with scope documented.
```

---

# 104. Final API Design Statement

The API is intentionally designed around:

```text
small surface area
+ explicit business semantics
+ safe retries
+ server-controlled pricing
+ stable error codes
+ clear customer/operation separation
+ reviewer-friendly Swagger/Postman
```

The most important API-level guarantee is:

> **A client can safely retry a booking request without accidentally creating another booking, and every business conflict is returned explicitly rather than hidden behind generic errors.**

The implementation should prioritize these guarantees over adding non-essential CRUD endpoints.
