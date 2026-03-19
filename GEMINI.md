# Project Mandates: Vendus-pro Backend

This document serves as the primary source of truth for project-specific conventions, architectural patterns, and implementation standards. These mandates take precedence over general defaults.

## Architectural Overview

- **Framework:** NestJS (TypeScript).
- **ORM:** Prisma with split schema files located in `prisma/schema/`.
- **Database:** PostgreSQL.
- **Multitenancy:** Strict tenant isolation using `tenantId` across all core entities.
- **Integrations:** 
    - **Asaas:** Primary payment gateway for Pix, Boleto, and Onboarding.
    - **Clerk:** Authentication and Identity Management.
    - **Redis:** Used for Socket.io adapters and potential caching.

## Core Conventions

### 1. Database & Prisma
- **Split Schemas:** Prisma models are organized by module in `prisma/schema/*.prisma`. Always update the relevant sub-schema file.
- **Migrations:** Use `npx prisma migrate dev` for local changes. Never modify migration files manually.
- **Naming:** Use `camelCase` for model fields and `snake_case` for database table names (via `@@map`).

### 2. Service Layer & Logic
- **Business Logic:** Keep controllers thin; place complex logic, calculations, and external integrations (like Asaas) in Services.
- **Transactions:** Use `this.prisma.$transaction` for operations involving multiple related database updates to ensure atomicity (e.g., registering a payment and updating a title status).
- **Logging:** Use the custom logger factory: `private readonly logger = createLogger(ClassName.name);`.

### 3. Asaas Integration
- **Webhooks:** Handled in `AsaasWebhookController`. Events are dispatched via `EventEmitter2` using the pattern `asaas.{EVENT_NAME}`.
- **Webhook Logging:** All incoming webhooks must be logged in the `WebhookEvent` table with `status: PENDING` before processing.
- **Sub-accounts:** Each tenant has its own Asaas sub-account identified by `asaasApiKey` and `asaasAccountId`.

### 4. Financial Module
- **Titles & Movements:** A `FinancialTitle` represents a debt or credit. A `FinancialMovement` represents a specific transaction (payment/receipt) against a title.
- **Status Transitions:**
    - `OPEN` -> `PARTIAL` (if partially paid)
    - `OPEN/PARTIAL` -> `PAID` (if balance is zero)
    - `OPEN` -> `OVERDUE` (if past due date)
- **Calculation Precision:** Always use `toNumber()` helper and `roundTo(val, 2)` for currency calculations to avoid floating-point issues.

## Testing Standards
- **Unit Tests:** Located alongside source files (`.spec.ts`).
- **E2E Tests:** Located in the `test/` directory.
- **Validation:** Always verify financial status changes and movement creation when fixing bugs in the payment flow.

## Implementation Workflow
1. **Research:** Check `prisma/schema/` for model definitions before making database-related changes.
2. **Strategy:** For external integrations (Asaas), verify existing service methods in `src/asaas/asaas.service.ts`.
3. **Execution:** Ensure `tenantId` is always handled correctly via `AuthenticatedUser` and `TenantGuard`.
4. **Validation:** Use `npm run test` or specific `jest` commands to verify changes.
