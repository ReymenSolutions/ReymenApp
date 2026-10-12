# ReymenApp — Technical Documentation

> **Document Version:** 1.5 | **Date:** September 2026 (updated through Fase 17c — Food Ops menu categories/modifiers, POS sales webhook with cancellations, lenient modifier-option validation, modifier-sale tracking, content-hash ETag/304 caching, separate POS read-only key, SmartCard bridge, admin user management, Next.js 16 upgrade)  
> **Language:** English/Spanish (technical terms in English, explanations bilingual)  
> **Audience:** Developers, DevOps, and technical team members
>
> **Estado al día (octubre 2026):** este documento cubre hasta Fase 17c. Lo agregado después (Operación, Delivery, inventario en un paso, borrar ventas de prueba del POS, SmartCard desde Admin, límites de SmartCard por plan, renombres, modo oscuro, deslizar para actualizar) está resumido en [`docs/HANDOFF.md`](./HANDOFF.md), que es el documento de continuidad de ReymenApp y ReymenPOS.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema](#4-database-schema)
5. [Authentication & RBAC](#5-authentication--rbac)
6. [Multi-tenancy](#6-multi-tenancy)
7. [n8n Integration](#7-n8n-integration)
8. [Webhook Security](#8-webhook-security)
9. [API Reference](#9-api-reference)
10. [Server Actions](#10-server-actions)
11. [Template Engine](#11-template-engine)
12. [Audit System](#12-audit-system)
13. [Environment Variables](#13-environment-variables)
14. [Local Development Setup](#14-local-development-setup)
15. [Docker Deployment](#15-docker-deployment)
16. [Directory Structure](#16-directory-structure)
17. [Key Patterns](#17-key-patterns)
18. [Extending the Platform](#18-extending-the-platform)

---

## 1. Platform Overview

**ReymenApp** (by Reymen Solutions) is a multi-tenant SaaS application that provides AI-powered business operations automation for SMBs. It combines a CRM, WhatsApp AI assistant, knowledge base management, automated workflow execution, and — as of Fases 14–16 — two additional commercial verticals (Food Ops for restaurants, a SmartCard NFC/QR bridge) through a unified portal, each gated by the same commercial module entitlement system (§17 item 7).

### What it is

- A **Next.js 16** web application with App Router serving both a client-facing portal and an internal admin panel.
- A **multi-tenant CRM** where each tenant (organization) has isolated data, leads, automations, and settings.
- A **bidirectional integration layer** between the portal and **n8n** (the open-source workflow automation engine).
- A **multi-vertical module platform**: beyond CRM/WhatsApp/Automations, `FOOD_OPS` (restaurant sales,
  inventory, recipe costing, break-even/net-profit analytics — §4, §17 items 13–14) and `NFC_QR`
  (a bridge into the separate `reymen-smartcard` product — §17 item 12) are commercial modules an
  organization can have `ACTIVE`, same as any other.

### Who it's for

| Persona | Description |
|---------|-------------|
| **End clients** | Business owners and their teams (clinics, real estate agencies, gyms, law firms, workshops, e-commerce stores) who access the portal to manage their operations |
| **Reymen admins** | Internal team members who manage client accounts, publish automation templates, and monitor the platform |

### The n8n Invisibility Principle

A core architectural decision is that **clients never see n8n**. The n8n URL, workflow IDs, webhook secrets, and all technical integration details are invisible to the portal user. From a client's perspective, automations simply "work." The platform exposes only business-level status (ACTIVE, ERROR, event history) and hides all infrastructure details. This reduces complexity for clients and allows Reymen to swap or upgrade the automation engine without affecting the user experience.

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │    Nginx    │  Port 80/443 (TLS termination)
                    │  (reverse   │
                    │   proxy)    │
                    └──────┬──────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
  ┌──────▼──────┐                    ┌───────▼──────┐
  │  Next.js 16 │                    │     n8n      │
  │  App Router │   Internal HTTP    │  (workflow   │
  │  (Port 3000)│◄──────────────────►│   engine)   │
  │             │   webhooks         │  (Port 5678) │
  └──────┬──────┘                    └──────────────┘
         │
  ┌──────▼──────┐
  │ PostgreSQL  │
  │    16       │
  │ (Port 5432) │
  └─────────────┘
```

### Route Groups

The Next.js application uses App Router route groups to separate concerns:

| Route Group | Path Pattern | Who accesses |
|-------------|-------------|--------------|
| `(auth)` | `/login`, `/forgot-password` | Anyone (public) |
| `(portal)` | `/portal/*` | Authenticated clients (OWNER, MANAGER, AGENT, VIEWER, CLIENT) |
| `(admin)` | `/admin/*` | Reymen staff only (SUPER_ADMIN, ADMIN) |

### API Routes

| Pattern | Description |
|---------|-------------|
| `/api/auth/[...nextauth]` | NextAuth.js authentication handlers |
| `/api/webhooks/n8n/*` | Inbound webhooks from n8n (public, HMAC-protected) |
| `/api/v1/knowledge-base` | Knowledge base query endpoint (dual-auth) |
| `/api/portal/leads/export` | CSV export for portal users |

### Multi-Tenant Isolation Model

Every database query in the portal is scoped by `organizationId` extracted from the JWT session. There are no cross-tenant data leaks because:

1. The `organizationId` comes from the server-side session, never from user-supplied query parameters.
2. All Prisma queries include `where: { organizationId: session.user.organizationId }`.
3. The `assertOrgAccess()` utility in `src/lib/tenant.ts` provides an explicit guard for edge cases.

---

## 3. Tech Stack

### Full dependency list with versions

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^16.3.5 | React framework with App Router, Server Actions, and Server Components |
| `react` / `react-dom` | ^19.0.0 | UI rendering library |
| `next-auth` | ^5.0.0-beta.25 | Authentication (NextAuth v5 / Auth.js) |
| `@auth/prisma-adapter` | ^2.7.4 | Connects NextAuth sessions to Prisma |
| `@prisma/client` | ^6.8.2 | Type-safe database ORM client |
| `prisma` | ^6.8.2 | Database ORM and migration tooling |
| `bcryptjs` | ^3.0.2 | Password hashing |
| `zod` | ^3.25.32 | Runtime schema validation |
| `react-hook-form` | ^7.56.4 | Performant form state management |
| `@hookform/resolvers` | ^5.0.1 | Zod adapter for react-hook-form |
| `recharts` | ^2.15.3 | Chart library for dashboards and reports |
| `sonner` | ^2.0.5 | Toast notifications |
| `zustand` | ^5.0.3 | Client-side state management |
| `@tanstack/react-query` | ^5.80.1 | Server state caching and synchronization |
| `date-fns` | ^4.1.0 | Date formatting and manipulation |
| `lucide-react` | ^0.511.0 | Icon library |
| `tailwindcss` | ^4.1.8 | Utility-first CSS framework |
| `clsx` | ^2.1.1 | Conditional class name utility |
| `tailwind-merge` | ^3.3.0 | Tailwind class deduplication |
| `class-variance-authority` | ^0.7.1 | Component variant system |
| `@radix-ui/*` | ^1.x – ^2.x | Headless accessible UI primitives (Dialog, Select, Switch, Tabs, etc.) |
| `typescript` | ^5.8.3 | Type checking |
| `tsx` | ^4.19.4 | TypeScript execution for scripts (seed) |

### Runtime Environment

- **Node.js:** 20+ (22 in Docker)
- **Database:** PostgreSQL 16 (Alpine in Docker)
- **Workflow Engine:** n8n (latest, self-hosted)

---

## 4. Database Schema

### Schema file location

`prisma/schema.prisma` — provider: `postgresql`, ORM: `prisma-client-js`

---

### Model: Organization

The root tenant entity. Every piece of data in the system belongs to an Organization.

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique           // URL-safe identifier
  industry  String?                    // clinic | real_estate | gym | legal | workshop | ecommerce
  logoUrl   String?
  isActive  Boolean  @default(true)   // soft-disable entire tenant
  plan      String   @default("starter") // starter | professional | enterprise
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Relationships:** has many Users, Leads, Automations, Conversations, Appointments, Requests, Metrics, AuditLogs, WebhookEvents, KnowledgeBase entries, Prompts, TemplateInstallations; has one WhatsAppAssistant.

---

### Model: User

Platform user. Can be a Reymen admin (no organizationId) or a client team member (has organizationId).

```prisma
model User {
  id             String   @id @default(cuid())
  email          String   @unique
  name           String?
  passwordHash   String?
  role           UserRole @default(CLIENT)
  organizationId String?
  isActive       Boolean  @default(true)
}
```

**Key indexes:** `[organizationId]`, `[email]`

**Related models:** Account, Session (NextAuth standard models)

---

### Enum: UserRole

```prisma
enum UserRole {
  SUPER_ADMIN  // Reymen platform superadmin
  ADMIN        // Reymen internal admin
  OWNER        // Client organization owner
  MANAGER      // Client team manager
  AGENT        // Client sales/support agent
  VIEWER       // Read-only client user
  CLIENT       // Legacy / minimal-access client role
}
```

---

### Model: Lead

CRM prospect record. Scoped to an Organization with soft-delete support.

```prisma
model Lead {
  id             String     @id @default(cuid())
  organizationId String
  name           String
  email          String?
  phone          String?
  source         String?    // whatsapp | web | referral | manual | n8n
  status         LeadStatus @default(NEW)
  score          Int?       // 0-100, set by AI via webhook
  scoreReason    String?    // Human-readable explanation of AI score
  notes          String?
  metadata       Json?      // Arbitrary extra data from n8n
  assignedTo     String?    // User ID of assigned agent
  doNotContact   Boolean    @default(false) // opt-out: excluded from FollowUpRule candidates regardless of status/timing
  deletedAt      DateTime?  // Soft-delete timestamp
}
```

**Key indexes:** `[organizationId]`, `[organizationId, status]`, `[organizationId, createdAt]`

---

### Enum: LeadStatus

```prisma
enum LeadStatus {
  NEW         // Just captured
  CONTACTED   // First contact made
  QUALIFIED   // Meets ideal customer profile
  PROPOSAL    // Quote/proposal sent
  WON         // Deal closed
  LOST        // Did not convert
}
```

---

### Model: Automation

Represents one deployed n8n workflow assigned to a tenant. The `n8nWorkflowId` is never exposed to the client portal.

```prisma
model Automation {
  id             String           @id @default(cuid())
  organizationId String
  name           String
  description    String?
  type           String           // lead_capture | appointments | follow_up | crm | retention
  status         AutomationStatus @default(ACTIVE)
  n8nWorkflowId  String?          // Internal n8n workflow reference (hidden from clients)
  webhookSecret  String           // Per-automation HMAC secret (32 random hex bytes)
  config         Json?            // Org-specific configuration overrides
}
```

---

### Enum: AutomationStatus

```prisma
enum AutomationStatus {
  ACTIVE    // Running normally
  PAUSED    // Temporarily stopped
  ERROR     // Failed execution detected by webhook
  ARCHIVED  // Permanently deactivated
}
```

---

### Model: AutomationEvent

Execution history record for an Automation. Written by the `/api/webhooks/n8n/automations` endpoint.

```prisma
model AutomationEvent {
  id             String      @id @default(cuid())
  automationId   String
  organizationId String
  type           String      // e.g. "lead_captured", "appointment_created"
  status         EventStatus @default(PENDING)
  payload        Json?       // Event-specific data
  errorMessage   String?
  duration       Int?        // Execution time in milliseconds
}
```

---

### Enum: EventStatus

```prisma
enum EventStatus {
  PENDING
  SUCCESS
  FAILED
  RETRYING
}
```

---

### Model: Conversation

A WhatsApp (or other channel) conversation thread. Can be AI-handled or escalated to a human.

```prisma
model Conversation {
  id             String             @id @default(cuid())
  organizationId String
  channel        String             // "whatsapp"
  contactPhone   String?
  contactName    String?
  status         ConversationStatus @default(OPEN)
  aiHandled      Boolean            @default(true)
  assignedToId   String?            // human owner while aiHandled=false; null = unassigned/AI
  escalatedAt    DateTime?
  resolvedAt     DateTime?
}
```

`assignedToId` and `aiHandled` are independent: `assignConversation()` sets who owns the conversation without necessarily touching AI/human mode (assigning to someone does force `aiHandled=false`, as a safety default; unassigning leaves it as-is), while `takeHumanControl()`/`releaseToAI()` toggle `aiHandled` and set/clear the assignment together. The n8n AI-reply workflow must check `GET /api/v1/conversations/status` before generating an automatic reply and stay silent when `aiHandled` is `false` — this is the anti-collision guard between the bot and a human agent.

---

### Enum: ConversationStatus

```prisma
enum ConversationStatus {
  OPEN       // Active, bot responding
  ESCALATED  // Transferred to human agent
  RESOLVED   // Agent resolved the issue
  CLOSED     // Conversation ended
}
```

---

### Model: Message

Individual message within a Conversation.

```prisma
model Message {
  id             String                 @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String                 @db.Text
  metadata       Json?
  senderId       String?                // set only for role=AGENT — the portal user who sent it
  attachmentUrl  String?                @db.Text  // https:// URL or a data: URL for a small (<=5MB) inline upload
  attachmentType String?                // MIME type
  deliveryStatus MessageDeliveryStatus? // outbound only (AGENT/ASSISTANT); null for inbound USER/SYSTEM
}
```

---

### Enum: MessageRole

```prisma
enum MessageRole {
  USER       // Client / WhatsApp contact
  ASSISTANT  // AI bot response
  SYSTEM     // Internal event (e.g., "Escalated to human")
  AGENT      // Manual reply sent by a human from the portal
}
```

---

### Enum: MessageDeliveryStatus

```prisma
enum MessageDeliveryStatus {
  PENDING    // Stored, outbound trigger to n8n just fired
  SENT       // n8n confirmed it reached WhatsApp
  DELIVERED  // WhatsApp delivery receipt
  READ       // WhatsApp read receipt
  FAILED     // Outbound trigger failed, or n8n reported a send failure
}
```

---

### Model: Appointment

Calendar appointment, created either by the AI assistant or manually via the portal.

```prisma
model Appointment {
  id             String            @id @default(cuid())
  organizationId String
  leadId         String?           // Optional link to a Lead
  serviceId      String?           // Optional link to a Service — auto-fills duration/buffer on booking
  title          String
  description    String?
  startTime      DateTime
  endTime        DateTime
  status         AppointmentStatus @default(SCHEDULED)
  source         String?           // "ai" | "manual"
  metadata       Json?
}
```

**Key indexes:** `[organizationId]`, `[organizationId, startTime]`

Times are stored in UTC as always; `Organization.timezone` (an IANA name, e.g. `"America/Mexico_City"`) is only
used to render them and to evaluate `AvailabilityRule` windows in the org's own local time — see
`src/lib/availability.ts`.

---

### Enum: AppointmentStatus

```prisma
enum AppointmentStatus {
  SCHEDULED   // Booked, not yet confirmed
  CONFIRMED   // Confirmed by client or staff
  CANCELLED   // Cancelled
  COMPLETED   // Appointment took place
  NO_SHOW     // Client did not attend
}
```

---

### Model: Service

A bookable service (e.g. "Consulta general", 30 min). Optional on `Appointment` — booking without a service
still works exactly as before, with a manually chosen end time.

```prisma
model Service {
  id              String   @id @default(cuid())
  organizationId  String
  name            String
  description     String?
  durationMinutes Int
  bufferMinutes   Int      @default(0) // gap enforced after this service's own bookings, not retroactive
  price           Float?
  isActive        Boolean  @default(true)
}
```

---

### Model: AvailabilityRule

A recurring weekly open window, evaluated in the organization's own timezone (e.g. Mon-Fri 9:00-18:00 =
five rows with `dayOfWeek` 1-5, `startMinute` 540, `endMinute` 1080). **An organization with zero active
rows has no restriction configured** — every slot is bookable, which is the same behavior every organization
had before this model existed, so nothing breaks for an org that hasn't opted into Agenda hours yet.

```prisma
model AvailabilityRule {
  id             String   @id @default(cuid())
  organizationId String
  dayOfWeek      Int      // 0 = Sunday .. 6 = Saturday
  startMinute    Int      // minutes since local midnight
  endMinute      Int
  isActive       Boolean  @default(true)
}
```

A booking that crosses local midnight is always rejected rather than matched against two different days'
rules — see `isWithinAvailability()` in `src/lib/availability.ts`.

---

### Models: AppointmentReminderRule / AppointmentReminderLog

Configuration-only, following the same "platform stores config, n8n executes" principle as the rest of the
integration (see §7). The platform never sends a reminder itself.

```prisma
model AppointmentReminderRule {
  id             String   @id @default(cuid())
  organizationId String
  offsetMinutes  Int      // e.g. 1440 (24h) or 60 (1h) before the appointment's startTime
  channel        String   @default("whatsapp")
  template       String
  isActive       Boolean  @default(true)
}

model AppointmentReminderLog {
  id            String   @id @default(cuid())
  appointmentId String
  ruleId        String
  sentAt        DateTime @default(now())

  @@unique([appointmentId, ruleId]) // a given rule can only ever fire once per appointment
}
```

---

### Models: FollowUpRule / FollowUpLog

Same "platform stores config, n8n executes" principle as appointment reminders above, applied to automated
lead follow-ups (the audit's point 5 — previously nonexistent). `Lead.doNotContact` (see above) is the
opt-out: a lead with it set is never a candidate, regardless of status or timing.

```prisma
model FollowUpRule {
  id                    String     @id @default(cuid())
  organizationId        String
  name                  String
  triggerStatus         LeadStatus // a lead is only a candidate while its status matches this
  delayMinutes          Int        // minutes since Lead.updatedAt before the first attempt fires
  repeatIntervalMinutes Int?       // null = fire at most once per lead; otherwise re-fire on this cadence
  maxAttempts           Int        @default(1)
  channel               String     @default("whatsapp")
  template              String
  isActive              Boolean    @default(true)
}

model FollowUpLog {
  id     String   @id @default(cuid())
  leadId String
  ruleId String
  sentAt DateTime @default(now())
}
```

Unlike `AppointmentReminderLog`, `FollowUpLog` has **no unique constraint** on `(leadId, ruleId)` — a
repeating rule fires more than once for the same lead, and "attempts so far" is simply a count of these
rows. Leaving `triggerStatus` (rather than a separate "stop" flag) as the only gate is deliberate: once a
lead's status changes — moves to `WON`/`LOST`, or is manually re-contacted into `CONTACTED` — it stops
matching the rule on its own, with no extra bookkeeping required.

---

### Model: Request

Support/feature request submitted by a client organization to Reymen.

```prisma
model Request {
  id             String        @id @default(cuid())
  organizationId String
  title          String
  description    String        @db.Text
  type           String        // support | new_automation | change | question
  status         RequestStatus @default(OPEN)
  priority       String        @default("medium") // low | medium | high
  resolvedAt     DateTime?
}
```

---

### Enum: RequestStatus

```prisma
enum RequestStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}
```

---

### Model: Metric

Time-series metric storage for dashboard KPIs and charts.

```prisma
model Metric {
  id             String   @id @default(cuid())
  organizationId String
  key            String
  value          Float
  period         String   // e.g. "2026-05", "2026-05-30"

  @@unique([organizationId, key, period])
}
```

The compound unique constraint prevents duplicate metric entries for the same organization, key, and period.

**Fase 9 — this table is now actually written.** Earlier phases defined the model but nothing ever
called `prisma.metric.create`/`upsert` — `recordMetric()` (`src/lib/metrics.ts`) closed that gap.
It's a thin, fire-and-forget helper (same principle as `logAudit()`: a metrics write must never
fail the real operation it's counting) that upserts a monthly bucket (`period` = `"YYYY-MM"`,
`monthPeriod()`) with an atomic `{ value: { increment } }`, so concurrent events in the same
org/key/month accumulate correctly instead of racing on a read-then-write.

```typescript
export const METRIC_KEYS = {
  LEADS_CAPTURED: "leads_captured",
  MESSAGES_SENT: "messages_sent",
  MESSAGES_RECEIVED: "messages_received",
  AUTOMATION_EXECUTIONS: "automation_executions",
  AUTOMATION_FAILURES: "automation_failures",
  APPOINTMENTS_BOOKED: "appointments_booked",
  CONVERSATIONS_ESCALATED: "conversations_escalated",
} as const;
```

It's called from the exact points where each of these events already durably happens — never a
new polling/aggregation job, consistent with §7's "no new internal cron" rule:

| Metric key | Written from |
|---|---|
| `leads_captured` | `processLeadEvent()` (n8n `/leads` webhook, only on an actual new row — never on a deduped/no-op delivery) and `createLead()` (manual portal creation) |
| `messages_received` / `messages_sent` | `processConversationEvent()` (n8n `/conversations` webhook — `USER`→received, `ASSISTANT`→sent; `SYSTEM` messages aren't counted) and `sendManualMessage()` (portal AGENT reply→sent) |
| `automation_executions` / `automation_failures` | `processAutomationEvent()` (n8n `/automations` webhook) — executions on every event, failures only when `status === "FAILED"` |
| `appointments_booked` | `createAppointment()` (portal) — not `rescheduleAppointment()`, which moves an existing booking rather than creating a new one |
| `conversations_escalated` | `escalateConversation()` (portal) |

**Where it's read:** the admin per-client operations center (§17's Fase 8 pattern) gained a
"Consumo (últimos 6 meses)" chart (`ConsumptionChart.tsx`) plotting `leads_captured`,
`messages_sent + messages_received`, and `automation_executions` per month, plus a
leads-vs-plan-limit indicator next to the leads stat card. That indicator intentionally compares
the **total** lead count (`Lead` rows, matching `assertPlanCapacity()`'s own semantics in
`src/lib/plan-limits.ts` — the plan's `leads` cap is a lifetime ceiling, not a monthly one) rather
than a monthly `leads_captured` metric, to avoid comparing two different things that happen to
share a word.

---

### Model: WebhookEvent

Reliability buffer for inbound n8n webhooks. Every incoming webhook is stored before processing. This enables audit trails and retry logic.

```prisma
model WebhookEvent {
  id             String             @id @default(cuid())
  organizationId String
  source         String             // "n8n"
  eventType      String             // "lead.created" | "automation.event" | etc.
  payload        Json
  status         WebhookEventStatus @default(PENDING)
  attempts       Int                @default(0)
  processedAt    DateTime?
  errorMessage   String?
}
```

---

### Enum: WebhookEventStatus

```prisma
enum WebhookEventStatus {
  PENDING     // Received but not processed
  PROCESSING  // Currently being processed
  PROCESSED   // Successfully processed
  FAILED      // Processing failed after all attempts
}
```

---

### Model: AuditLog

Immutable append-only audit trail of important platform actions.

```prisma
model AuditLog {
  id             String   @id @default(cuid())
  organizationId String?
  userId         String?
  action         String   // e.g. "lead.create", "client.plan_change"
  resource       String   // e.g. "Lead", "Organization", "User"
  resourceId     String?
  metadata       Json?    // Action-specific context
  ipAddress      String?
}
```

**Key indexes:** `[organizationId, createdAt]`, `[userId]`

---

### Model: WhatsAppAssistant

One-to-one with Organization. Stores the AI assistant configuration for a tenant.

```prisma
model WhatsAppAssistant {
  id             String   @id @default(cuid())
  organizationId String   @unique
  name           String   @default("Asistente AI")
  greeting       String   @db.Text
  personality    String?  @db.Text
  capabilities   String[] // ["appointments", "faq", "lead_capture", "follow_up", "escalation"]
  isActive       Boolean  @default(true)
  phoneNumber    String?
}
```

Created/updated atomically via `prisma.whatsAppAssistant.upsert()` — safe to call even if the record doesn't exist yet.

---

### Model: KnowledgeBase

Articles that the AI assistant uses to answer questions. Filterable by category and `isActive`.

```prisma
model KnowledgeBase {
  id             String   @id @default(cuid())
  organizationId String
  title          String
  content        String   @db.Text
  category       String?
  tags           String[] // PostgreSQL text array
  isActive       Boolean  @default(true)
}
```

**Key indexes:** `[organizationId]`, `[organizationId, category]`, `[organizationId, isActive]`

---

> **Nota (obsoleto):** el gestor de Prompts y el AI Lab (versionado, A/B, casos) se retiraron de la app: el Agente IA usa solo `BusinessRulebook` + `KnowledgeBase` (`buildBusinessInstructions`). La migración `prompts_into_rulebook` copió los prompts activos al Rulebook; las tablas siguientes se conservan sin uso hasta revisar el resultado. El probador (`testAgentReply` → `previewAgentReply`) reemplaza al AI Lab.

### Model: Prompt

AI instruction templates. Multiple prompts per type are allowed, but only one can be `isActive: true` per type per organization (enforced by the `activatePrompt` server action using `$transaction`).

```prisma
model Prompt {
  id             String     @id @default(cuid())
  organizationId String
  name           String
  content        String     @db.Text
  type           PromptType
  isActive       Boolean    @default(false)
}
```

**Key indexes:** `[organizationId]`, `[organizationId, type]`, `[organizationId, type, isActive]`

---

### Enum: PromptType

```prisma
enum PromptType {
  SYSTEM              // Core identity and rules
  GREETING            // Welcome message structure
  LEAD_QUALIFICATION  // How to qualify prospects
  APPOINTMENT_BOOKING // How to schedule appointments
  FAQ                 // How to handle FAQ using KB
  ESCALATION          // When and how to escalate
}
```

---

### Models: AI Lab (Fase 7) — prompt versioning, sandbox, test cases, A/B

Every edit to a Prompt's content is snapshotted instead of overwritten in place — the same
"never destructive" principle as `TemplateVersion` (§11). `Prompt.content`/`updatedAt` always
mirrors the latest version, so every pre-existing read path (portal prompts page, n8n's use of
the active prompt) keeps working unchanged; `PromptVersion` is purely additive history used by
rollback, test-case runs, and A/B experiments, which pin an exact version rather than "whatever
is live right now".

```prisma
model PromptVersion {
  id        String   @id @default(cuid())
  promptId  String
  version   Int
  content   String   @db.Text
  changelog String?  @db.Text
  createdBy String?
  isLatest  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@unique([promptId, version])
}
```

`createPrompt()` creates version 1 atomically with the Prompt row. `updatePrompt()` only creates
a new version when `content` actually changes (a name-only edit doesn't bump the version) —
same "demote all, insert new `isLatest`" `$transaction` pattern as `activatePrompt()`/
`addTemplateVersion()`. `rollbackPromptVersion(promptId, targetVersionId)` **never deletes
history** — it appends a brand-new version whose content copies an older one (like reverting a
commit) and points `Prompt.content` at it. The portal's prompts page exposes this via a
"Historial de versiones" dialog (`PromptVersionHistoryDialog.tsx`) next to each prompt.

An isolated test conversation, never synced to WhatsApp or visible to a real contact:

```prisma
model AiSandboxSession {
  id              String   @id @default(cuid())
  organizationId  String
  name            String   @default("Sesión de prueba")
  promptVersionId String?  // which draft/version is pinned for this session, if any
  createdBy       String?
}

model AiSandboxMessage {
  id                   String      @id @default(cuid())
  sessionId            String
  role                 MessageRole // USER (tester's turn) | ASSISTANT (n8n's generated reply)
  content              String      @db.Text
  knowledgeBaseContext String[]    // KB article ids sent as context — "available", not a claim of use
  latencyMs            Int?
}
```

A saved input reusable across prompt versions, plus its graded run history:

```prisma
model PromptTestCase {
  id            String     @id @default(cuid())
  organizationId String
  promptType    PromptType
  name          String
  userMessage   String     @db.Text
  expectedNotes String?    @db.Text // human grading criteria — there is no automatic judge
}

model PromptTestCaseResult {
  id                   String   @id @default(cuid())
  testCaseId           String
  promptVersionId      String
  reply                String   @db.Text
  knowledgeBaseContext String[]
  passed               Boolean? // null = ungraded; a human grades it via the portal UI
  gradedBy             String?
  latencyMs            Int?
}
```

Side-by-side comparison of two versions of the same prompt type. Each sample runs the same
message through both variants; a human judges per-sample and the experiment is closed out with
an overall winner:

```prisma
model PromptExperiment {
  id             String           @id @default(cuid())
  organizationId String
  promptType     PromptType
  name           String
  variantAId     String           // PromptVersion id
  variantBId     String           // PromptVersion id
  status         ExperimentStatus @default(RUNNING) // RUNNING | COMPLETED
  winnerVariant  String?          // "A" | "B" | "TIE"
}

model PromptExperimentSample {
  id           String   @id @default(cuid())
  experimentId String
  userMessage  String   @db.Text
  replyA       String   @db.Text
  replyB       String   @db.Text
  preferred    String?  // "A" | "B" | "TIE"
}
```

Closing an experiment with a winner is informational only — it does **not** auto-promote a
version into the live Prompt (variants being compared may belong to different `Prompt` entities
of the same type, so "promote" is ambiguous by design). The user applies the winner manually via
the existing prompts page (activate it, or roll back to it).

**Where the actual AI reply comes from:** the platform never calls an LLM provider directly.
`runAiLabInference()` (`src/lib/ai-lab.ts`) matches KnowledgeBase context the same way
`/api/v1/knowledge-base` does (substring match on the user message, falling back to the most
recently updated active articles), then calls **`triggerN8nWorkflowSync()`**
(`src/lib/n8n.ts`) — a synchronous sibling of `triggerN8nWorkflow()` that, unlike the
fire-and-forget outbound trigger used everywhere else, awaits n8n's actual HTTP response body
(20s timeout) because the sandbox/test-case/experiment UI needs the real generated reply to
display. The org's n8n instance must expose a webhook at `ai-lab-test` configured to **respond**
(not "respond immediately") with `{ reply: string, knowledgeBaseContext?: string[] }`. If that
workflow isn't configured yet, `runAiLabInference()` throws a clear, actionable error naming the
missing route — never mock/fabricated text. This preserves the n8n-invisibility principle (§1):
the client never sees n8n, but the actual generation still happens there, not in the Node process.

---

### Model: AutomationTemplate

A reusable automation blueprint managed by Reymen admins. Clients install templates from the marketplace.

```prisma
model AutomationTemplate {
  id              String   @id @default(cuid())
  name            String
  description     String   @db.Text
  longDescription String?  @db.Text
  industry        String   // clinic | real_estate | gym | legal | workshop | ecommerce
  category        String   // lead_capture | appointments | follow_up | crm | retention
  tags            String[]
  iconEmoji       String   @default("⚡")
  isPublished     Boolean  @default(false)
  currentVersion  String?  // Latest semver, e.g. "1.0.0"
  createdBy       String?  // Admin userId who created it
}
```

---

### Model: TemplateVersion

A specific release of an AutomationTemplate. Contains the actual n8n workflow JSON.

```prisma
model TemplateVersion {
  id              String   @id @default(cuid())
  templateId      String
  version         String   // Semver: "1.0.0"
  changelog       String?  @db.Text
  n8nWorkflowJson Json     // Complete n8n workflow export
  n8nWorkflowId   String?  // ID of the workflow deployed in n8n instance
  defaultConfig   Json?    // Default variable values
  isLatest        Boolean  @default(true)

  @@unique([templateId, version])
}
```

When a new version is added, a `$transaction` atomically:
1. Sets `isLatest: false` on all existing versions for the template.
2. Creates the new version with `isLatest: true`.
3. Updates `AutomationTemplate.currentVersion`.

---

### Model: TemplateInstallation

Tracks which organizations have installed which templates. The compound unique constraint `[organizationId, templateId]` ensures only one installation record per org-template pair (can be ACTIVE or UNINSTALLED).

```prisma
model TemplateInstallation {
  id             String             @id @default(cuid())
  organizationId String
  templateId     String
  versionId      String
  automationId   String?            // FK to the Automation created on install
  status         InstallationStatus @default(PENDING)
  config         Json?

  @@unique([organizationId, templateId])
}
```

---

### Enum: InstallationStatus

```prisma
enum InstallationStatus {
  PENDING      // Install initiated
  INSTALLING   // In progress
  ACTIVE       // Successfully installed and running
  FAILED       // Installation failed
  UNINSTALLED  // Client uninstalled it
}
```

---

### Models: Food Ops (Fases 14–17) — restaurant sales, inventory, recipes, costing, menu structure

A second commercial line of business (`PlatformModule.FOOD_OPS`), built the same way CRM/WhatsApp
were: real models gated by `requireModule`/`assertModuleEnabled` (§17 item 7), no demo data
presented as real except two explicitly-badged blocks on the dashboard (`DemoBadge`,
`DEMO_TOP_DISHES`/`DEMO_RECENT_PURCHASES` in `food/page.tsx`) that don't have a backing model yet.

**Phase 1 — the simple stuff (daily aggregates, no recipes):**

```prisma
model FoodSale {
  id             String   @id @default(cuid())
  organizationId String
  occurredAt     DateTime @default(now()) // business date, not necessarily createdAt
  channel        String?  // free text ("Mostrador", "Domicilio"...), same pattern as Lead.source
  grossAmount    Decimal  @db.Decimal(10, 2)
  netAmount      Decimal  @db.Decimal(10, 2)
}

model FoodInventoryItem {
  id             String                @id @default(cuid())
  organizationId String
  name           String
  unit           String                // "kg", "lt", "pza"... free text
  category       FoodInventoryCategory @default(EDIBLE)
  currentStock   Decimal               @default(0) @db.Decimal(10, 2)
  minStock       Decimal               @default(0) @db.Decimal(10, 2)
  unitCost       Decimal?              @db.Decimal(10, 2)

  @@unique([organizationId, name])
}

enum FoodInventoryCategory {
  EDIBLE
  NON_EDIBLE
}

model FoodSupplier {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  contactName    String?
  phone          String?
  email          String?
}
```

`FoodSale` is still the only source of truth for daily revenue (`getFoodSalesSummary()`,
`getFoodHourlySales()`, the net-profit calc below) — it was never replaced, only supplemented.
`getFoodDailySales()`/`getFoodHourlySales()` compute "vs. yesterday"/"vs. previous 30 days" trend
percentages purely by comparing rolling windows of this table; no external benchmark.

**Phase 2 — dishes, recipes, real costing (Fase 15/16):**

A restaurant menu item is a `FoodDish` (the name shown on the menu) with one or more
`FoodDishVariant` (what's actually priced and sold — "Chico"/"Grande", "Salmón"/"Pollo", or just
one variant labeled `"Único"` for a dish with no options). This two-level split replaced an
earlier single-price-per-dish design once the platform needed to represent a menu that genuinely
sells the same dish at different sizes: each variant carries **its own** price and **its own**
recipe, because a large size doesn't just cost proportionally more — it's a different, separately-
priced product with its own ingredient list.

```prisma
model FoodDish {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  isActive       Boolean @default(true) // soft-disable, never hard-deleted

  @@unique([organizationId, name])
}

model FoodDishVariant {
  id             String  @id @default(cuid())
  dishId         String
  organizationId String  // denormalized from dish.organizationId — see below
  label          String  // "Único" | "Chico" | "Grande" | "Salmón" | ...
  price          Decimal @db.Decimal(10, 2)
  externalPosId  String? // POS integration hook — see below

  @@unique([dishId, label])
  @@unique([organizationId, externalPosId])
}

model FoodDishVariantIngredient {
  id              String  @id @default(cuid())
  variantId       String
  inventoryItemId String
  quantity        Decimal @db.Decimal(10, 3) // per one portion of THIS variant

  @@unique([variantId, inventoryItemId])
}

model FoodDishSale {
  id             String   @id @default(cuid())
  organizationId String
  variantId      String
  occurredAt     DateTime @default(now()) // one row per variant per business day
  quantity       Int

  @@unique([variantId, occurredAt])
}

model FoodOperatingCost {
  id             String  @id @default(cuid())
  organizationId String
  name           String  // "Renta del local", "Nómina"...
  amountMonthly  Decimal @db.Decimal(10, 2)
  isActive       Boolean @default(true)
}
```

`Organization.foodTargetCostPct` (`Int`, default `30`) is the one Food-specific org setting —
the target ingredient-cost percentage the price recommendation formula divides by (see below).

**Phase 3 — menu categories and modifiers (Fase 17):** built for a real external POS integration
(§4's `GET /api/v1/food/menu`, §7's `POST /api/webhooks/pos/orders`) to have menu structure and
options to render, not just a flat dish list.

```prisma
model FoodDishCategory {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  sortOrder      Int      @default(0)

  dishes FoodDish[]

  @@unique([organizationId, name])
}

model FoodModifierGroup {
  id             String   @id @default(cuid())
  organizationId String
  name           String   // "Término", "Extras"...
  minSelect      Int      @default(0) // 0 = optional
  maxSelect      Int      @default(1) // 1 = single choice, >1 = multi
  sortOrder      Int      @default(0)

  options   FoodModifierOption[]
  dishLinks FoodDishModifierGroup[]
}

model FoodModifierOption {
  id          String  @id @default(cuid())
  groupId     String
  name        String
  priceDelta  Decimal @default(0) @db.Decimal(10, 2) // never negative -- a discount isn't a modifier
  sortOrder   Int     @default(0)
}

model FoodDishModifierGroup { // join table: modifiers attach to the DISH, not the variant
  dishId  String
  groupId String

  @@id([dishId, groupId])
}
```

`FoodDish` gained `categoryId String?` (`onDelete: SetNull` — deleting a category just
uncategorizes its dishes, no history is lost) and the `modifierGroups` back-relation. Modifier
groups attach at the **dish** level, not per-variant: an option like "sin cebolla" applies
regardless of which size the customer picked, so duplicating it per variant would just be
redundant data entry. There's no ingredient/cost linkage for modifiers in this phase (a "extra
cheese" option doesn't deduct inventory or affect the dish's calculated cost) — deliberately
scoped out until a real need for it shows up.

**Hard delete here, soft-disable everywhere else in Food:** `FoodDishCategory` and
`FoodModifierGroup` are genuinely deleted (`deleteFoodDishCategory`/`deleteFoodModifierGroup`,
guarded by a `window.confirm()` in the UI) — unlike `FoodDish`/`FoodOperatingCost`, which use
`isActive` because sales/analytics history references them. Nothing in the analytics pipeline
references a category or modifier group directly, so a hard delete with `onDelete: SetNull`
(category) / `Cascade` (the join table) is safe and doesn't need an "inactive categories" filter
nobody asked for. `FoodModifierOptionSale` (Fase 17b, below) had to respect this same decision
rather than adding a real FK back to `FoodModifierOption` and reopening the exact problem
soft-disable was meant to avoid.

**Tracking modifier sales — `FoodModifierOptionSale` (Fase 17b):** the POS webhook (below) can
optionally report which modifier options were sold with each item, via `items[].modifiers`. This
closes a real gap: a "Queso extra" modifier adds to the order's `grossAmount`/`netAmount` already,
but until this, Reymen had no record that it was sold at all — no popularity data, and no future
path to deducting its ingredients or costing it once that linkage exists (still out of scope, see
above). The model:

```prisma
model FoodModifierOptionSale {
  id             String   @id @default(cuid())
  organizationId String
  optionId       String   // sin FK -- ver el párrafo de arriba
  optionName     String   // foto del nombre al momento de la venta
  occurredAt     DateTime @default(now())
  quantity       Int

  @@unique([optionId, occurredAt])
}
```

`optionId` is a plain string, not a relation — `FoodModifierOption` is one of the two entities in
this module that's actually hard-deleted, so a real FK with `onDelete: Cascade` would silently
destroy this sales history the day someone deletes the option, and `onDelete: SetNull` would leave
rows nobody could attribute to anything. `optionName` is captured once, at the moment of sale, so
a report stays legible even after the option is renamed or deleted later — the same reasoning
`AuditLog.metadata` snapshots use elsewhere in this codebase. `processFoodPosOrder()` checks every
`optionId` in the payload against the calling org (via `option.group.organizationId`), but —
**unlike `variantId`** — an unrecognized one is silently dropped from that item instead of
rejecting the whole order (Fase 17c, §7): the realistic cause is a POS with a stale cached menu,
and losing the entire dish sale over a modifier the customer's charge already accounts for would
be a worse outcome than just not logging that one modifier's popularity. Recognized modifiers
upsert with the same increment-not-replace semantics as `FoodDishSale` — including accepting a
negative `quantity` for a cancellation.

**Why `FoodDishSale` is separate from `FoodSale`:** `FoodSale` (Phase 1) is still the only real
source for total daily revenue. `FoodDishSale` is an *optional, additive* daily log of "how many
units of this exact variant sold today" — deliberately not required, so a restaurant can keep
using the simple total-only flow forever and only real, entered numbers ever feed the analytics
below (never a fabricated sales mix). Saving again for the same variant/day **replaces** the
quantity, it doesn't add to it — corrects a typo without double-counting.

**The cost/margin pipeline (`src/lib/food.ts`):** every profitability number in the module flows
through one function, `getFoodDishesWithCost(orgId)` → `flattenVariants()`, never recomputed
ad hoc:

- **Cost** of a variant = `Σ (ingredient.quantity × inventoryItem.unitCost)` over its own recipe rows.
- **Margin** = `price − cost`; **margin %** = `margin / price` (`null` if price is 0, never a
  divide-by-zero).
- **Break-even** (`getFoodBreakEven`) has two views: **per-variant** (`fixedCosts ÷ that variant's
  margin` — always available, no sales history needed) and **blended** (weighted-average margin
  across the real 30-day sales mix from `FoodDishSale` — only shown when that data exists, never
  invented).
- **Net profit** (`getFoodNetProfit`, period `today`/`7d`/`30d`) = `FoodSale.netAmount` (revenue) −
  `Σ FoodDishSale.quantity × variant.cost` (COGS, only for variants with logged sales) − fixed
  costs prorated to the period. Returns a `coverage` object (`itemsWithSales`/`totalActiveItems`)
  so the UI can flag a partial/underestimated figure instead of presenting it as complete.
- **Recommendations** (`getFoodProfitRecommendations`) compare each variant's margin against
  fixed thresholds (`LOW_MARGIN_PCT=15`, `HIGH_MARGIN_PCT=40`) and its 30-day sales volume against
  the **median** of the menu's own sold variants (not an absolute unit count — scales to a small
  stand or a chain without configuration): negative margin → `review_urgent`; high volume + low
  margin → `raise_price_or_cut_cost`; low volume + high margin → `promote`.
- **Recommended price** (`recommendDishPrice`, pure function) = `cost ÷ (targetCostPct / 100)` —
  the standard restaurant-industry formula. Duplicated verbatim (not imported) inside
  `FoodPriceCalculator.tsx` because `lib/food.ts` imports Prisma at module scope and would bundle
  it into client JS if imported from a `"use client"` file — same reasoning applies to why
  `FoodDishFormDialog.tsx` doesn't import `DEFAULT_VARIANT_LABEL` from `lib/food.ts` either.

**POS integration (Fase 16 groundwork, Fase 17 live):** `FoodDishVariant.externalPosId`
(nullable, `@@unique([organizationId, externalPosId])`, same dedup pattern as `Lead.externalId`)
lets a point-of-sale system map its own item IDs to this catalog without guessing by name.
`GET /api/v1/food/menu` (§9) is the read side: active dishes/variants/price/`externalPosId`, now
also embedding each dish's category and assigned modifier groups+options, gated by `FOOD_OPS` and
authenticated the same dual way as `/api/v1/knowledge-base`. `POST /api/webhooks/pos/orders` (§7)
is the write side: order-ingestion, same auth/idempotency machinery as the n8n webhooks (§8) but
under its own `pos` source — see there for why it **accumulates** into `FoodDishSale` instead of
replacing.

---

## 5. Authentication & RBAC

### JWT Strategy

Authentication is handled by **NextAuth v5** (`next-auth@^5.0.0-beta.25`) with:

- **Session strategy:** `jwt` (stateless JWTs, no server-side session store)
- **Provider:** Credentials (email + bcrypt-hashed password)
- **Adapter:** `@auth/prisma-adapter` (for Account and Session models)

### Login Flow

```
1. User submits email + password
2. Server validates via loginSchema (zod): email format, password min 6
3. prisma.user.findUnique({ where: { email, isActive: true } })
4. bcrypt.compare(password, user.passwordHash)
5. On success: returns { id, email, name, role, organizationId }
6. NextAuth creates JWT containing: id, role, organizationId
7. On every request: JWT is decoded and injected into session
```

### Session Shape

```typescript
interface Session {
  user: {
    id: string;
    role: UserRole;
    organizationId: string | null;
    email: string;
    name?: string;
  }
}
```

The `role` and `organizationId` fields are stored in the JWT at login and do not require a database lookup on each request.

### Helper Functions

```typescript
// src/lib/auth.ts

// Returns true if role is SUPER_ADMIN or ADMIN (Reymen internal)
export function isAdmin(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

// Returns true if role is a client-side role
export function isClientRole(role: UserRole): boolean {
  return ["OWNER", "MANAGER", "AGENT", "VIEWER", "CLIENT"].includes(role);
}
```

### RBAC: Permission System

Fine-grained permissions are enforced by the `can()` function in `src/lib/permissions.ts`.

```typescript
export function can(role: UserRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}
```

#### Available Actions

```typescript
type Action =
  | "leads:create"
  | "leads:delete"
  | "leads:update_status"
  | "opportunities:create"
  | "opportunities:manage"
  | "pipeline:manage"
  | "automations:view"
  | "automations:manage"
  | "conversations:view"
  | "conversations:escalate"
  | "conversations:resolve"
  | "conversations:reply"
  | "conversations:assign"
  | "knowledge_base:manage"
  | "prompts:manage"
  | "team:manage"
  | "requests:create"
  | "reports:view"
  | "settings:view"
  | "settings:manage";
```

#### Permission Matrix

| Action | SUPER_ADMIN | ADMIN | OWNER | MANAGER | AGENT | VIEWER | CLIENT |
|--------|:-----------:|:-----:|:-----:|:-------:|:-----:|:------:|:------:|
| `leads:create` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `leads:delete` | ✓ | ✓ | ✓ | — | — | — | — |
| `leads:update_status` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `automations:view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `automations:manage` | ✓ | ✓ | ✓ | — | — | — | — |
| `conversations:view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `conversations:escalate` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `conversations:resolve` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `knowledge_base:manage` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `prompts:manage` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `team:manage` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `requests:create` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `reports:view` | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| `settings:view` | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `settings:manage` | ✓ | ✓ | ✓ | — | — | — | — |

### Plan Limits

```typescript
export const PLAN_LIMITS = {
  starter:      { leads: 500,   users: 2,  automations: 3,  label: "Starter" },
  professional: { leads: 5000,  users: 10, automations: 15, label: "Professional" },
  enterprise:   { leads: 99999, users: 99, automations: 99, label: "Enterprise" },
};
```

Plan limits are defined in `src/lib/permissions.ts` and should be checked in server actions before creating new resources.

---

## 6. Multi-tenancy

### How organizationId scoping works

The platform is a **shared-database, shared-schema** multi-tenant architecture. All tenants share the same PostgreSQL database and schema, with row-level isolation enforced at the application layer.

**The isolation mechanism:**

1. At login, the user's `organizationId` is encoded into the JWT.
2. All Server Actions extract `session.user.organizationId` from the server-side auth context (not user input).
3. Every Prisma query in the portal layer includes `organizationId: session.user.organizationId` in the `where` clause.
4. There is no way for a client to supply their own `organizationId` — it always comes from the verified JWT.

**Example pattern (every portal server action follows this):**

```typescript
export async function createLead(formData: FormData) {
  const session = await auth();
  // organizationId is ALWAYS from the session JWT, never from user input
  if (!session?.user.organizationId) throw new Error("No autorizado");

  await prisma.lead.create({
    data: {
      organizationId: session.user.organizationId, // enforced
      // ... other fields from formData
    },
  });
}
```

### Middleware Route Guard

`src/proxy.ts` runs on every request (except static assets) and enforces:

```typescript
// Admin routes require SUPER_ADMIN or ADMIN
if (isAdminRoute && role !== "SUPER_ADMIN" && role !== "ADMIN") {
  return NextResponse.redirect(new URL("/portal/dashboard", req.url));
}

// Portal routes require an organization
if (isPortalRoute && !session.user.organizationId) {
  return NextResponse.redirect(new URL("/login", req.url));
}
```

Public routes (session not required — each authenticates itself another way, or needs no auth):
- `/login`, `/forgot-password`, `/reset-password`
- `/api/webhooks/*` (secured by HMAC instead of session)
- `/api/v1/*` (the n8n pull endpoints — `/knowledge-base`, `/conversations/status`, `/appointments/due-reminders`, `/leads/due-followups` — each authenticates via `X-Api-Key` matched against the organization's own `n8nWebhookSecret`, falling back to a session only for browser callers, checked inside the route itself; **fixed in Fase 6** — these were previously falling through to the session check below and being 307-redirected to `/login` on every unauthenticated n8n call, which meant none of the pull endpoints actually worked in production, see `src/proxy.test.ts`)
- `/api/auth/*` (NextAuth handlers)
- `/api/cron/*` (secured by `CRON_SECRET` instead of session)
- `/api/health` (must be reachable by load balancers/uptime monitors without a session)

### Why n8n URLs are never exposed to clients

The `n8nWorkflowId` field on the `Automation` model is stored in the database but is **never returned** in portal-facing API responses or rendered in the portal UI. The `triggerN8nWorkflow()` function runs server-side only. Clients see only the automation's name, status, and event history — not any n8n-specific identifiers.

This also means that if Reymen changes the n8n instance URL or migrates workflows, zero client-facing changes are required.

---

## 7. n8n Integration

The integration between the platform and n8n is **bidirectional**:

### Outbound: Platform → n8n (Triggering Workflows)

When the platform needs to invoke an n8n workflow (e.g., trigger a lead follow-up), it uses `triggerN8nWorkflow()` from `src/lib/n8n.ts`:

```typescript
export async function triggerN8nWorkflow(
  webhookPath: string,
  payload: N8nTriggerPayload
): Promise<{ success: boolean; error?: string }>
```

**Parameters:**
- `webhookPath`: the n8n webhook path (e.g., `lead-follow-up`)
- `payload.organizationId`: the tenant ID
- `payload.event`: the event name
- `payload.data`: event-specific data

**How it works:**
1. Serializes the payload to JSON.
2. Creates an HMAC-SHA256 signature using `N8N_WEBHOOK_SECRET`.
3. POSTs to `${N8N_BASE_URL}/webhook/${webhookPath}` with headers:
   - `X-Reymen-Signature: sha256={hex}`
   - `X-Reymen-Source: platform`
4. Returns `{ success: true }` or `{ success: false, error: string }`.

**Current caller:** `sendManualMessage()` (`src/actions/conversations.ts`) is the one place today that calls
`triggerN8nWorkflow()`, using `webhookPath: "whatsapp-outbound"`. When an agent replies from the portal, the
platform stores the `Message` (`deliveryStatus: PENDING`) first, then fires this trigger so the actual send
through the WhatsApp Business API happens entirely inside n8n — the platform never holds WhatsApp API
credentials. If the trigger itself fails to reach n8n (network error, non-2xx), the message is marked
`FAILED` immediately; otherwise n8n reports the real outcome asynchronously via the `message.status` webhook
below.

```json
{
  "organizationId": "org_xxx",
  "event": "message.send",
  "data": {
    "conversationId": "conv_xxx",
    "messageId": "msg_xxx",
    "contactPhone": "+52 55 1234 5678",
    "channel": "whatsapp",
    "content": "Claro, tenemos disponibilidad el jueves.",
    "attachmentUrl": null,
    "attachmentType": null
  }
}
```

### Inbound: n8n → Platform (Webhook Events)

n8n sends data back to the platform via five webhook endpoints. All are POST routes located under `/api/webhooks/n8n/`.

#### WebhookEvent Reliability Pattern

Every inbound webhook follows the **store-then-process** pattern:

```
1. Verify HMAC signature → reject if invalid (401)
2. Store raw payload as WebhookEvent (status: PROCESSING)
3. Parse and validate the payload
4. Execute business logic (create Lead, update Automation, etc.)
5. Update WebhookEvent status → PROCESSED or FAILED
```

This ensures:
- Every event is recorded before processing begins.
- Failed events are logged with error messages for debugging.
- The system can audit all events received from n8n.

### All 7 Inbound Webhook Routes

#### POST `/api/webhooks/n8n/leads`

Creates a new Lead record from n8n.

**Headers required:**
```
X-Reymen-Signature: sha256={hmac}
X-Reymen-OrgId: {organizationId}
```

**Request body:**
```json
{
  "name": "María García",
  "email": "maria@gmail.com",
  "phone": "+52 55 1234 5678",
  "source": "whatsapp",
  "metadata": { "utm_campaign": "summer-2026" }
}
```

**Behavior:**
- Verifies org is active.
- Creates `Lead` with `source: payload.source ?? "n8n"`.
- Sets `WebhookEvent.eventType = "lead.created"`.

---

#### POST `/api/webhooks/n8n/automations`

Reports an automation execution event (success or failure).

**Request body:**
```json
{
  "automationId": "auto-demo-1",
  "type": "lead_captured",
  "status": "SUCCESS",
  "payload": {},
  "errorMessage": null,
  "duration": 1234
}
```

**Behavior:**
- Creates an `AutomationEvent` record.
- If `status === "FAILED"`, updates `Automation.status = "ERROR"`.
- Sets `WebhookEvent.eventType = "automation.event"`.

---

#### POST `/api/webhooks/n8n/conversations`

Creates or updates a Conversation and appends a Message.

**Request body:**
```json
{
  "conversationId": "optional-existing-id",
  "contactPhone": "+52 55 1234 5678",
  "contactName": "María García",
  "channel": "whatsapp",
  "message": {
    "role": "USER",
    "content": "Hola, quisiera una cita"
  }
}
```

**Behavior:**
- If `conversationId` is provided: looks up that conversation.
- If not: looks up an OPEN conversation by `contactPhone` for the org.
- If none found: creates a new Conversation.
- Always creates a new Message within the conversation.
- Returns `{ success: true, conversationId: "..." }`.

---

#### POST `/api/webhooks/n8n/scoring`

Updates the AI score and reason for a Lead.

**Request body:**
```json
{
  "leadId": "clxyz123",
  "score": 87,
  "reason": "Empresa grande, presupuesto confirmado, decisor identificado."
}
```

**Behavior:**
- Validates `score` is between 0 and 100 (inclusive).
- Verifies Lead belongs to the org and is not soft-deleted (`deletedAt: null`).
- Updates `Lead.score` (rounded to integer) and `Lead.scoreReason`.

---

#### POST `/api/webhooks/n8n/message-status`

Reports the delivery outcome of a message the platform asked n8n to send via `whatsapp-outbound` (see above).

**Request body:**
```json
{
  "messageId": "msg_xxx",
  "status": "DELIVERED",
  "errorMessage": null
}
```

**Behavior:**
- Looks up the `Message` by id, scoped through its conversation's `organizationId` (never trusts a bare id from
  another org).
- Updates `Message.deliveryStatus`. A non-null `errorMessage` is stored in `Message.metadata.deliveryError`.
- Sets `WebhookEvent.eventType = "message.status"`.

### Pull endpoint: `/api/v1/conversations/status`

Unlike the routes above (n8n pushes events to the platform), this one is the platform exposing state **for n8n
to pull**, the same pattern as `/api/v1/knowledge-base`. The AI-reply workflow calls it right before generating
an automatic response:

```
GET /api/v1/conversations/status?orgId=org_xxx&contactPhone=%2B525512345678
Header: X-Api-Key: {organization's n8nWebhookSecret}
```

Returns `{ data: { conversationId, aiHandled, status, assignedToId } }` — no matching open conversation returns
`aiHandled: true` (the bot is free to create one and respond, matching a brand-new `Conversation`'s default).
**If `aiHandled` is `false`, the workflow must not generate a reply** — a human has taken or been given control
via `takeHumanControl()`/`assignConversation()`. This is the anti-collision guard between the bot and a human
agent; skipping this check means the bot and a human agent can race to answer the same message.

#### POST `/api/webhooks/n8n/appointment-reminder-sent`

Reports that a reminder from `/api/v1/appointments/due-reminders` (below) was actually sent, so that
(appointmentId, ruleId) combination is never returned as due again.

**Request body:**
```json
{ "appointmentId": "apt_xxx", "ruleId": "rule_xxx" }
```

**Behavior:**
- Verifies both the appointment and the rule belong to the calling organization.
- Inserts an `AppointmentReminderLog` row; a duplicate insert (P2002 on the `(appointmentId, ruleId)` unique
  constraint) is treated as a successful idempotent no-op, same pattern as every other domain-level dedup in
  this codebase.

### Pull endpoint: `/api/v1/appointments/due-reminders`

Same pull pattern as `/api/v1/conversations/status` above — there is still no cron inside the platform for
this. The reminders automation in n8n polls this on its own schedule and sends the actual WhatsApp message
for each row returned:

```
GET /api/v1/appointments/due-reminders?orgId=org_xxx
Header: X-Api-Key: {organization's n8nWebhookSecret}
```

For every active `AppointmentReminderRule`, returns each upcoming `SCHEDULED`/`CONFIRMED` appointment whose
`startTime` falls within `(now, now + rule.offsetMinutes]` and that has no `AppointmentReminderLog` row for
that rule yet — i.e. every reminder that is due right now and hasn't been sent. Each row carries the raw
`template` string and the appointment's `contactName`/`contactPhone` (via its `Lead`, when linked) for n8n to
interpolate and send; the platform does not render the final message itself.

#### POST `/api/webhooks/n8n/followup-sent`

Reports that a follow-up attempt from `/api/v1/leads/due-followups` (below) was actually sent.

**Request body:**
```json
{ "leadId": "lead_xxx", "ruleId": "rule_xxx" }
```

**Behavior:**
- Verifies both the lead and the rule belong to the calling organization.
- Inserts a `FollowUpLog` row — **not** idempotent at the domain level like `appointment-reminder-sent`,
  since a repeating rule is expected to log more than one attempt for the same lead. A retried delivery of
  the *same* webhook call is still only counted once, via the delivery-level `externalEventId` dedup in
  `ingestWebhookEvent` (§8) — the two dedup layers protect against different failure modes, same as
  elsewhere in this integration.

### Pull endpoint: `/api/v1/leads/due-followups`

Same pull pattern as the two endpoints above. The follow-ups automation in n8n polls this on its own
schedule and sends the actual message for each row returned:

```
GET /api/v1/leads/due-followups?orgId=org_xxx
Header: X-Api-Key: {organization's n8nWebhookSecret}
```

For every active `FollowUpRule`, returns each lead in the organization whose `status` matches
`rule.triggerStatus`, `doNotContact` is `false`, `deletedAt` is null, and `updatedAt` is at least
`delayMinutes` in the past — filtered further by attempt count and, for a repeating rule, by how long ago
its last logged attempt was (`repeatIntervalMinutes`). A lead already at `rule.maxAttempts` is never
returned again for that rule. Each row carries the raw `template` string, the lead's contact info, and
`attemptNumber` for n8n to interpolate and send.

### POST `/api/webhooks/pos/orders` (Fase 17 — not an n8n route, same machinery)

The one inbound webhook in the platform that doesn't come from n8n: a restaurant's external
point-of-sale system posts each completed order here. It reuses the exact same reliability
stack as the n8n webhooks above — `isWebhookAuthorized()` (HMAC-SHA256 over the raw body, bound
to a fresh timestamp, against the target org's own `n8nWebhookSecret` — §8), `checkRateLimit()`,
and `ingestWebhookEvent()` for delivery-level idempotency — just under its own `source: "pos"`
instead of `"n8n"`, since it isn't one.

**Request body:**
```json
{
  "occurredAt": "2026-09-22T18:30:00.000Z",
  "channel": "POS",
  "grossAmount": 250,
  "netAmount": 215.52,
  "items": [
    {
      "variantId": "cuid_of_a_FoodDishVariant",
      "quantity": 2,
      "modifiers": [{ "optionId": "cuid_of_a_FoodModifierOption", "quantity": 2 }]
    }
  ]
}
```

`items[].modifiers` is optional (Fase 17b) — omit it entirely if the POS doesn't track which
modifier options were sold. Each entry needs a nonzero integer `quantity`, same rule as the item's
own `quantity` (negative for a cancellation). See `FoodModifierOptionSale` (§4) for what this
feeds and why it isn't a real foreign key to `FoodModifierOption`.

**`grossAmount` vs `netAmount`:** `grossAmount` is the amount actually charged to the customer
(what's on the ticket, tax included, tip excluded). `netAmount` is that same amount **without
IVA** — `grossAmount / 1.16` in Mexico's 16% case — never "after discounts"; the POS doesn't apply
discounts, so there's no separate concept to represent there. This matters beyond bookkeeping:
`netAmount` is the exact field `getFoodNetProfit()` (§4) reads as "Ingresos" for the utilidad-neta
calculation, so if it included IVA, every profitability number derived from POS sales would be
inflated by the tax collected on the government's behalf, not the restaurant's own revenue. The
manual portal entry (`createFoodSale`, §10) uses the same definition for its own "Bruto"/"Neto"
fields — this isn't a POS-specific rule.

**Behavior (`processFoodPosOrder()` in `src/lib/food.ts`):**
- Requires `FOOD_OPS` to be enabled for the org (throws otherwise — the same 422 path as any
  other validation failure, see below).
- Validates every `variantId` belongs to the calling organization before writing anything —
  an order referencing another org's variant is rejected whole, not partially applied. This one
  stays strict on purpose: it's the actual product sold, and the money in `grossAmount`/
  `netAmount` is already tied to it.
- `modifiers[].optionId` is handled differently, **on purpose**: an option that doesn't exist or
  belongs to another organization is silently dropped from that item instead of rejecting the
  whole order (Fase 17c). The payload shape is still validated strictly (a non-string `optionId`
  or a zero/non-integer `quantity` still throws) — only the *existence* check is lenient. The
  realistic trigger is a POS with a stale cached menu (an admin renamed or deleted a modifier
  option in Reymen after the POS last fetched `GET /api/v1/food/menu`); rejecting the entire order
  over that would also lose the real dish sale and revenue it carries, over something that doesn't
  even change the amount charged (the modifier's price is already folded into `grossAmount`).
  There's no name to fall back to for a dropped modifier — the payload only carries `optionId`,
  not a label — so it's dropped, not recorded under a placeholder.
- In one `$transaction`: creates a `FoodSale` row (so this order also counts toward the existing
  daily-revenue totals), **upserts** each `FoodDishSale` row with
  `quantity: { increment: item.quantity }` instead of a flat replace, and does the same
  increment-upsert into `FoodModifierOptionSale` for every *recognized* modifier.

**Why this accumulates instead of replacing (unlike manual entry):** `logFoodDishSales()` (the
portal's own daily units-sold form, §10) intentionally **replaces** the day's quantity on
re-save — it's a human correcting a single daily total, and replace makes fixing a typo safe.
A POS sends one order at a time, potentially dozens per day for the same variant, so replacing
would silently lose every order but the last one processed. `processFoodPosOrder()` therefore
increments. Both write to the same `FoodDishSale` row under the same
`@@unique([variantId, occurredAt])` constraint — this dual semantic (documented directly on the
model in `prisma/schema.prisma`) is a property of *which caller* wrote the row, not a schema
flag, so a future reader hitting one code path doesn't need to reconcile it against the other.

A failed validation (missing FOOD_OPS, malformed payload, foreign variant) returns `422` with
`{ error: string }` — deliberately more informative than the generic `500` the n8n webhooks
return on failure, since this is an actively-developed external integration where a POS
developer needs to see *why* an order was rejected.

**Cancellations:** there's no separate cancel endpoint. A cancelled/adjusted order is sent as a
new POST to this same route with `items[].quantity` **negative** (any nonzero integer is
accepted, positive or negative) and `grossAmount`/`netAmount` negated to match. The same
`increment` upsert subtracts from the day's accumulated `FoodDishSale.quantity`, and the new
`FoodSale` row's negative amounts net out in the existing daily-revenue sums (`_sum` aggregations
in `getFoodDailySales()`/`getFoodHourlySales()`, §4) — no special-casing needed anywhere else in
the module. A `quantity` of exactly `0` is rejected (nothing to record); non-integer quantities
are rejected too.

---

## 8. Webhook Security

### Per-organization secrets, not a shared global one

Earlier revisions of this platform authenticated every inbound n8n webhook against a
single global `WEBHOOK_SECRET`/`N8N_WEBHOOK_SECRET` env var shared across **all**
organizations. That was a cross-tenant forgery risk: any org's n8n workflow (or
anyone who obtained the one shared value) could forge webhook calls claiming to be
any other organization by simply passing a different `orgId`. This was fixed in the
security review — inbound authentication is now **per-organization**:

- `Organization.n8nWebhookSecret` — a unique, randomly generated secret column,
  backfilled for existing orgs by migration `20260915040000_add_org_webhook_secret`
  and generated automatically for every new org (`createClient` action).
- Rotatable at any time from `/admin/clients/[clientId]` via the webhook info
  dialog (`src/components/admin/OrgWebhookInfoDialog.tsx` → `rotateOrgWebhookSecret`
  action) — rotating immediately invalidates the old value.
- `N8N_WEBHOOK_SECRET` (the env var) is now used **only** for outbound signatures —
  platform → n8n calls in `src/lib/n8n.ts`. It plays no role in verifying inbound
  webhooks anymore.

### A separate read-only key for POS menu reads (Fase 17)

`Organization.foodPosReadKey` (nullable, `@unique`, null until an admin generates one) exists so
a POS **device** never has to hold `n8nWebhookSecret` — the secret that can sign an order webhook
and thus write sales data. The read key can only authenticate `GET /api/v1/food/menu`; it isn't
accepted anywhere a signature is checked. `n8nWebhookSecret` still works there too (backward
compat with whatever already reads that endpoint), so this is additive, not a breaking change.

- Generated/rotated from the same webhook info dialog as `n8nWebhookSecret`
  (`rotateFoodPosReadKey` action, `src/actions/admin/clients.ts`), shown only when the org has
  `FOOD_OPS` enabled.
- Compared via the same constant-time `secretsMatch()` used everywhere else — never a plain `===`
  on a secret value.
- The intended split: the signing secret (`n8nWebhookSecret`) lives only on the POS's own
  server/backend, which is the thing actually posting to `/api/webhooks/pos/orders`; this read
  key can safely live on the point-of-sale terminal itself, since leaking it only exposes the
  menu, never write access.

### HMAC-SHA256 Verification

Inbound webhook endpoints (`/api/webhooks/n8n/{leads,conversations,scoring,automations,message-status,appointment-reminder-sent,followup-sent}`) use
HMAC-SHA256 signing via `src/lib/webhook-validator.ts`, verified against the
**target organization's own** `n8nWebhookSecret` (or, for `/automations`, that specific
automation's own `webhookSecret`):

```typescript
// route.ts: look up the org's own secret, then verify against it
const org = orgId
  ? await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, n8nWebhookSecret: true } })
  : null;

const authorized = org && isWebhookAuthorized(rawBody, hmacSignature, plainSecret, org.n8nWebhookSecret, timestamp);
```

```typescript
export function verifyWebhookSignature(
  payload: string,    // raw request body as string
  signature: string,  // value of X-Reymen-Signature header
  secret: string,      // that org's n8nWebhookSecret, looked up by orgId
  timestamp: string    // value of X-Reymen-Timestamp header — part of the signed message, see Replay Protection below
): boolean
```

**Signature format:** `sha256={hex_digest}`

**Algorithm:**
```
HMAC-SHA256(key=secret, message=`${timestamp}.${rawBody}`) → hex → "sha256=" + hex
```

The timestamp is mixed into the signed message, not just carried alongside it — a
signature computed for one timestamp doesn't verify against a different one, so an
attacker can't reuse a captured signature with a fresher timestamp of their choosing.

### Replay Protection (timestamp window)

A bare HMAC signature over the body never expires on its own: capture one valid
request (a proxy log, a misconfigured n8n execution log) and it verifies forever.
`isTimestampFresh()` in `webhook-validator.ts` closes that — the request is rejected
before the signature is even checked if `X-Reymen-Timestamp` (Unix milliseconds) is
missing or falls outside a window of the server's own clock:

```typescript
const REPLAY_WINDOW_MS = 5 * 60 * 1000;      // reject anything older than 5 minutes
const CLOCK_SKEW_AHEAD_MS = 30 * 1000;       // small forward allowance for sender clock drift

export function isTimestampFresh(timestamp: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const age = Date.now() - ts;
  return age <= REPLAY_WINDOW_MS && age >= -CLOCK_SKEW_AHEAD_MS;
}
```

**Breaking change for n8n workflows**: any workflow signing requests to this platform
must add the `X-Reymen-Timestamp` header and sign `${timestamp}.${body}` instead of
just `body`, or every request will be rejected with 401. This is documented on
`/admin/api-docs`. The dev-only plain-secret shortcut (`x-reymen-secret`, non-production
environments) is unaffected — it never involved a signature or timestamp.

### Idempotency (duplicate delivery / duplicate data prevention)

Two independent layers, since they protect against two different failure modes:

1. **Delivery-level** (`src/lib/webhook-ingest.ts`, `ingestWebhookEvent()`): the caller
   may send `X-Reymen-Event-Id` — its own stable ID for that specific delivery (e.g.
   n8n's execution ID). `WebhookEvent` has a unique constraint on
   `(organizationId, source, externalEventId)`; a resend of the same event id short-circuits
   as `{ success: true, duplicate: true }` without calling the processor a second time,
   including under real concurrency (two simultaneous identical deliveries — the second
   one's `WebhookEvent.create()` hits the unique constraint, caught and treated as a
   duplicate rather than an error).
2. **Domain-level** (`Lead.externalId`, `Message.externalId`): the payload may include
   its own stable ID for the underlying record (a CRM lead ID, a WhatsApp message ID).
   `processLeadEvent`/`processConversationEvent` check for an existing row with that
   `(organizationId | conversationId, externalId)` before creating, and the same unique
   constraints catch the concurrent case. This is what actually prevents a duplicate
   **Lead** or **Message**, independent of whether the delivery itself was deduped —
   two different deliveries (different event ids) describing the same underlying lead
   still collapse to one row.

Both are opt-in from n8n's side: a workflow that sends neither `externalId` nor
`X-Reymen-Event-Id` gets the pre-idempotency behavior (every delivery processed,
possible duplicates on retry) exactly as before. New/updated n8n workflows should
send both.

### Constant-Time Comparison

Verification uses `crypto.timingSafeEqual` (via the `secretsMatch()` helper in
`webhook-validator.ts`) to prevent **timing attacks**, replacing an earlier
hand-rolled XOR-accumulator comparison:

```typescript
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

The length check short-circuits before the constant-time comparison to avoid
leaking length information via timing; `Buffer` lengths, not string character
counts, are compared to stay correct for multi-byte content.

### Raw Body Requirement

The signature is computed over the **raw request body bytes**, before JSON parsing. This is why all webhook handlers use:

```typescript
const rawBody = await req.text(); // NOT req.json()
// ... verify signature against rawBody ...
const payload = JSON.parse(rawBody); // parse after verification
```

If you use `req.json()` first, the body stream is consumed and the raw bytes may differ (whitespace, encoding) from what n8n signed.

### Dual Auth: Knowledge Base API

The `/api/v1/knowledge-base` endpoint supports two authentication methods:

1. **API key** (`x-api-key` header): checked with `secretsMatch()` against the
   **target organization's own** `n8nWebhookSecret` — not a global env var. The
   `orgId` must be passed as `?orgId=xxx` query parameter, and the key must match
   that specific org's secret; a key valid for one org is rejected for any other.
2. **Session** (NextAuth JWT cookie): for portal browser access, used when no
   `x-api-key` header is present. The `orgId` is extracted from
   `session.user.organizationId`, so a logged-in user can only ever reach their
   own org's knowledge base regardless of query params.

---

## 9. API Reference

### POST `/api/webhooks/n8n/leads`

| Property | Value |
|----------|-------|
| Auth | HMAC (`X-Reymen-Signature`) |
| Tenant | `X-Reymen-OrgId` header |
| Creates | `Lead`, `WebhookEvent` |

**Request:**
```http
POST /api/webhooks/n8n/leads
X-Reymen-Signature: sha256=abc123...
X-Reymen-OrgId: org_cuid_here
Content-Type: application/json

{
  "name": "string (required)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "source": "string (optional, defaults to 'n8n')",
  "metadata": {}
}
```

**Responses:**

| Status | Body |
|--------|------|
| 200 | `{ "success": true }` |
| 401 | `{ "error": "Unauthorized" }` |
| 500 | `{ "error": "Processing failed" }` |

---

### POST `/api/webhooks/n8n/automations`

| Property | Value |
|----------|-------|
| Auth | HMAC (`X-Reymen-Signature`) |
| Tenant | `X-Reymen-OrgId` header |
| Creates | `AutomationEvent`; may update `Automation.status` |

**Request:**
```http
POST /api/webhooks/n8n/automations
X-Reymen-Signature: sha256=abc123...
X-Reymen-OrgId: org_cuid_here
Content-Type: application/json

{
  "automationId": "string (required)",
  "type": "string (required, e.g. 'lead_captured')",
  "status": "SUCCESS | FAILED | PENDING",
  "payload": {},
  "errorMessage": "string (optional)",
  "duration": 1234
}
```

**Side effect:** If `status === "FAILED"`, sets `Automation.status = "ERROR"`.

---

### POST `/api/webhooks/n8n/conversations`

| Property | Value |
|----------|-------|
| Auth | HMAC (`X-Reymen-Signature`) |
| Tenant | `X-Reymen-OrgId` header |
| Creates | `Conversation` (if not found), `Message` |

**Request:**
```http
POST /api/webhooks/n8n/conversations
X-Reymen-Signature: sha256=abc123...
X-Reymen-OrgId: org_cuid_here
Content-Type: application/json

{
  "conversationId": "string (optional)",
  "contactPhone": "string (required)",
  "contactName": "string (optional)",
  "channel": "string (required, e.g. 'whatsapp')",
  "message": {
    "role": "USER | ASSISTANT | SYSTEM",
    "content": "string"
  }
}
```

**Response:** `{ "success": true, "conversationId": "string" }`

---

### POST `/api/webhooks/n8n/scoring`

| Property | Value |
|----------|-------|
| Auth | HMAC (`X-Reymen-Signature`) |
| Tenant | `X-Reymen-OrgId` header |
| Updates | `Lead.score`, `Lead.scoreReason` |

**Request:**
```http
POST /api/webhooks/n8n/scoring
X-Reymen-Signature: sha256=abc123...
X-Reymen-OrgId: org_cuid_here
Content-Type: application/json

{
  "leadId": "string (required)",
  "score": 87,
  "reason": "string (optional)"
}
```

**Validation:** `score` must be between 0 and 100.

---

### GET `/api/v1/knowledge-base`

| Property | Value |
|----------|-------|
| Auth | `x-api-key` header OR NextAuth session |
| Returns | Active knowledge base articles for an org |

**Query parameters:**
- `orgId` (required if using API key auth)
- `category` (optional, filter by category)
- `q` (optional, full-text search in title and content)

**Request (n8n internal caller):**
```http
GET /api/v1/knowledge-base?orgId=org_cuid&category=faq&q=horario
x-api-key: {N8N_WEBHOOK_SECRET}
```

**Request (browser/session caller):**
```http
GET /api/v1/knowledge-base?category=faq
Cookie: next-auth.session-token=...
```

**Response:**
```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "content": "string",
      "category": "string",
      "tags": ["string"],
      "updatedAt": "ISO8601"
    }
  ],
  "meta": { "total": 5 }
}
```

---

### GET `/api/v1/food/menu`

| Property | Value |
|----------|-------|
| Auth | `x-api-key` header (matches either `n8nWebhookSecret` or the separate `foodPosReadKey`, §8) OR NextAuth session |
| Gate | Requires `FOOD_OPS` module `ACTIVE` for the resolved org — `403` otherwise |
| Returns | Active dishes with their variants, category, and assigned modifier groups, plus the org's category list |

Read-only projection for an external POS to render its menu from (§4 "Food Ops"). Order
ingestion is the write-side counterpart, `POST /api/webhooks/pos/orders` (§7) — not this route.
A POS device should authenticate here with `foodPosReadKey`, not `n8nWebhookSecret` — see §8 for
why that split exists.

**Query parameters:**
- `orgId` (required if using API key auth)

**Request (external integrator caller):**
```http
GET /api/v1/food/menu?orgId=org_cuid
x-api-key: {ORG_N8N_WEBHOOK_SECRET}
```

**Response:**
```json
{
  "data": [
    {
      "dishId": "string",
      "name": "Berry Bloom",
      "categoryId": "string | null",
      "categoryName": "string | null",
      "variants": [
        { "variantId": "string", "label": "Chico", "price": 100, "externalPosId": null },
        { "variantId": "string", "label": "Grande", "price": 160, "externalPosId": null }
      ],
      "modifierGroups": [
        {
          "groupId": "string",
          "name": "Extras",
          "minSelect": 0,
          "maxSelect": 3,
          "options": [{ "optionId": "string", "name": "Queso extra", "priceDelta": 15 }]
        }
      ]
    }
  ],
  "categories": [{ "id": "string", "name": "Bebidas", "sortOrder": 0 }],
  "meta": { "total": 1, "version": "a1b2c3..." }
}
```

**Caching (`meta.version` + `ETag`/`304`, Fase 17b):** the response carries an `ETag` header, and
`meta.version` is that same value unquoted. Both are a SHA-256 hash (truncated to 32 hex chars)
of the exact response content (`data`+`categories`+`total`) — **not** a `max(updatedAt)` across
the underlying rows. That distinction matters: an integrator originally proposed hashing
`updatedAt`, but a hard delete of a row that wasn't the most recently modified one (an old,
untouched category, for instance) never changes that maximum, so a cached `304` would keep the
menu showing something that no longer exists. Hashing the actual serialized content is exact by
construction — any change the response would reflect, deletions included, changes the hash.
Send the previous response's `ETag` back as `If-None-Match` on the next request; a match returns
`304` with an empty body (still with the `ETag` header set), a miss returns the full `200`
payload with a new one. There is no delta/incremental sync — a changed `ETag` means re-fetch the
whole menu, which was a deliberate choice over incremental sync (see §17 Key Patterns) once it
became clear that `FoodModifierGroup`/`FoodDishCategory` are genuinely hard-deleted (§4), so
there's no changelog a delta could be computed against without adding one.

---

### GET `/api/portal/leads/export`

| Property | Value |
|----------|-------|
| Auth | NextAuth session (organizationId required) |
| Returns | CSV file download |

**Request:**
```http
GET /api/portal/leads/export
Cookie: next-auth.session-token=...
```

**Response:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="leads-2026-05-30.csv"`

**CSV columns:** Nombre, Email, Teléfono, Fuente, Estado, Score AI, Notas, Fecha

Only returns leads where `deletedAt IS NULL` for the session's organization, ordered by `createdAt DESC`.

CSV special characters (commas, quotes, newlines within values) are properly escaped using RFC 4180 quoting rules.

---

## 10. Server Actions

All Server Actions are located in `src/actions/`. They use the `"use server"` directive and are the primary data mutation layer for the portal and admin.

### admin/clients.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createClient` | `(formData: FormData) => Promise<{ success: true, orgId: string }>` | Creates an Organization + OWNER user atomically |
| `changePlan` | `(orgId: string, plan: string) => Promise<{ success: true, plan: string }>` | Updates organization plan; validates against `["starter","professional","enterprise"]` |
| `updateClientStatus` | `(orgId: string, isActive: boolean) => Promise<{ success: true }>` | Activates or deactivates an organization |
| `assignAutomation` | `(orgId: string, data: { name, type, description?, n8nWorkflowId? }) => Promise<{ success: true, automationId: string }>` | Creates an Automation record for a client |
| `rotateOrgWebhookSecret` | `(orgId: string) => Promise<{ success: true, secret: string }>` | Regenerates `n8nWebhookSecret`; old value stops working immediately |
| `rotateFoodPosReadKey` | `(orgId: string) => Promise<{ success: true, secret: string }>` | Generates or regenerates `foodPosReadKey` (§8, Fase 17) |

All require `isAdmin(session.user.role)`.

---

### admin/users.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createOrgUser` | `(orgId: string, data: { name, email, role, password }) => Promise<{ success: true }>` | Creates a user under an existing organization |
| `updateOrgUser` | `(userId: string, data: { name, role }) => Promise<{ success: true }>` | Updates a user's name/role |
| `setUserActive` | `(userId: string, isActive: boolean) => Promise<{ success: true }>` | Activates/deactivates any user (org-bound or standalone) |
| `createStandaloneUser` | `(data: { name, email, role, password }) => Promise<{ success: true }>` | Creates an admin user with **no** `organizationId` — for internal Reymen staff, not a client |
| `getAllUsers` | `() => Promise<User[]>` | Global user directory (org-bound + standalone), backs `/admin/users` |

All require `isAdmin(session.user.role)`.

---

### admin/templates.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createTemplate` | `(data: TemplateSchema) => Promise<{ success: true, templateId: string }>` | Creates a new unpublished template |
| `updateTemplate` | `(templateId: string, data: Partial<TemplateSchema>) => Promise<{ success: true }>` | Updates template metadata |
| `publishTemplate` | `(templateId: string, isPublished: boolean) => Promise<{ success: true }>` | Publishes or unpublishes; requires at least one version to publish |
| `addTemplateVersion` | `(templateId: string, data: VersionSchema) => Promise<{ success: true }>` | Adds a new semver version; uses `$transaction` to atomically set `isLatest` |
| `installTemplateForClient` | `(orgId, templateId, versionId, config?) => Promise<{ success: true, automationId: string }>` | Admin-side installation: creates Automation + TemplateInstallation |

---

### leads.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createLead` | `(formData: FormData) => Promise<{ success: true, leadId: string }>` | Creates a lead for the session's org; logs audit |
| `updateLeadStatus` | `(leadId: string, status: LeadStatus) => Promise<{ success: true }>` | Updates status; verifies org ownership |
| `deleteLead` | `(leadId: string) => Promise<{ success: true }>` | Soft-deletes (sets `deletedAt`); logs audit |

---

### requests.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createRequest` | `(formData: FormData) => Promise<{ success: true }>` | Creates a support request; validates type enum |
| `updateRequestStatus` | `(requestId: string, status: RequestStatus) => Promise<{ success: true }>` | Admins can update any request; clients only their org's requests |

---

### conversations.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `escalateConversation` | `(conversationId: string) => Promise<{ success: true }>` | Sets status to ESCALATED; only works on OPEN conversations |
| `resolveConversation` | `(conversationId: string) => Promise<{ success: true }>` | Sets status to RESOLVED; records `resolvedAt` |

---

### knowledge-base.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createArticle` | `(data: ArticleSchema) => Promise<{ success: true }>` | Creates KB article for org |
| `updateArticle` | `(id: string, data: ArticleSchema) => Promise<{ success: true }>` | Updates article; verifies org ownership |
| `deleteArticle` | `(id: string) => Promise<{ success: true }>` | Hard-deletes article |
| `toggleArticle` | `(id: string, isActive: boolean) => Promise<{ success: true }>` | Activates or deactivates article |

---

### prompts.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createPrompt` | `(data: PromptSchema) => Promise<{ success: true }>` | Creates prompt with `isActive: false`, and a version-1 `PromptVersion` snapshot |
| `updatePrompt` | `(id: string, data: Partial<PromptSchema>) => Promise<{ success: true }>` | Updates prompt content/name; a content change appends a new `PromptVersion`, a name-only change doesn't |
| `activatePrompt` | `(id: string, type: PromptType) => Promise<{ success: true }>` | Atomically deactivates all prompts of the type, activates target |
| `deletePrompt` | `(id: string) => Promise<{ success: true }>` | Hard-deletes prompt (cascades to its versions) |
| `listPromptVersions` | `(promptId: string) => Promise<PromptVersion[]>` | History for the "Historial de versiones" dialog, newest first |
| `rollbackPromptVersion` | `(promptId, targetVersionId) => Promise<{ success: true }>` | Appends a new version copying an older one's content — never deletes history |

---

### ai-lab.ts (Fase 7)

All actions require `can(role, "prompts:manage")` **and** `assertModuleEnabled(orgId, "AI_WHATSAPP")` —
the AI Lab is treated as an extension of prompt management, not a separately-permissioned feature.

| Action | Signature | Description |
|--------|-----------|-------------|
| `createSandboxSession` | `({ name?, promptVersionId? }) => Promise<{ success: true, sessionId }>` | New isolated test conversation, optionally pinned to a specific prompt version |
| `listSandboxSessions` / `getSandboxSession` / `deleteSandboxSession` | — | Org-scoped CRUD for sandbox sessions |
| `sendSandboxMessage` | `(sessionId, content) => Promise<{success:true, message} \| {success:false, error}>` | Persists the USER message, calls `runAiLabInference()`; **on inference failure returns a structured error instead of throwing** (see note below) — the USER message is still persisted either way |
| `createTestCase` / `listTestCases` / `deleteTestCase` | — | Saved test cases, scoped by `organizationId` + optionally `promptType` |
| `runTestCase` | `(testCaseId, promptVersionId) => Promise<{success:true, result} \| {success:false, error}>` | Runs the saved message against a specific version; rejects if the version's prompt type doesn't match the test case's |
| `gradeTestCaseResult` | `(resultId, passed) => Promise<{ success: true }>` | Human grading — there is no automatic judge |
| `createExperiment` | `({ promptType, name, variantAId, variantBId }) => Promise<{ success: true, experimentId }>` | Both variants must be versions of a prompt of the given type, and must differ |
| `listExperiments` | — | Includes both variants and all samples |
| `runExperimentSample` | `(experimentId, userMessage) => Promise<{success:true, sample} \| {success:false, error}>` | Runs the same message through both variants in parallel |
| `judgeExperimentSample` | `(sampleId, preferred: "A"\|"B"\|"TIE") => Promise<{ success: true }>` | Per-sample human judgement |
| `completeExperiment` | `(experimentId, winnerVariant) => Promise<{ success: true }>` | Closes the experiment; does not auto-apply the winner (see AI Lab schema note above) |

**Why `sendSandboxMessage`/`runTestCase`/`runExperimentSample` return `{ success: false, error }`
instead of throwing on an n8n inference failure:** Next.js redacts a thrown Error's `.message`
from Server Actions in **production** builds (`next build && next start`) — the client only
receives a generic "an error occurred" digest, never the real text, unless the error is returned
as data. This was discovered via this phase's own production smoke test (dev mode — `next dev` —
does not exhibit it, which is why it had gone unnoticed) and affects **every** action in this
codebase that throws for an expected, user-facing condition, not just the AI Lab's. It was fixed
here only for the AI Lab's inference-failure path, since that message ("configure the `ai-lab-test`
n8n workflow") is central to the feature being usable at all; every other action still follows
the codebase's existing throw-and-catch-in-toast convention. Applying the same `{success, error}`
pattern platform-wide is a separate, cross-cutting fix outside this phase's scope — flagged for a
future pass rather than silently patched everywhere.

---

### whatsapp-assistant.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `upsertWhatsAppAssistant` | `(data: UpsertSchema) => Promise<{ success: true }>` | Creates or updates the assistant config for the org |
| `toggleAssistant` | `(isActive: boolean) => Promise<{ success: true }>` | Activates or deactivates the assistant; creates record if it doesn't exist |

---

### templates.ts (portal)

| Action | Signature | Description |
|--------|-----------|-------------|
| `installTemplate` | `(data: { templateId, config? }) => Promise<{ success: true, automationId: string }>` | Installs latest published version; creates Automation + TemplateInstallation; logs audit |
| `uninstallTemplate` | `(templateId: string) => Promise<{ success: true }>` | Sets installation to UNINSTALLED and archives the Automation atomically |

---

### team.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `inviteTeamMember` | `(data: { name, email, role, password }) => Promise<{ success: true }>` | Creates a new user (MANAGER/AGENT/VIEWER) in the org; checks `can(role, "team:manage")` |
| `removeTeamMember` | `(userId: string) => Promise<{ success: true }>` | Soft-deactivates user; cannot remove self or OWNER |

---

### appointments.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createAppointment` | `(data: { title, description?, startTime, endTime }) => Promise<{ success: true }>` | Creates appointment; validates `endTime > startTime` |
| `updateAppointmentStatus` | `(appointmentId: string, status: AppointmentStatus) => Promise<{ success: true }>` | Updates status; verifies org ownership |

---

### food.ts (Fases 14–17)

All require `assertModuleEnabled(orgId, "FOOD_OPS")`. Dish/variant actions replace their
nested ingredients/variants wholesale in a `$transaction` on every save rather than diffing
add/remove — see §4 "Food Ops" for why.

| Action | Signature | Description |
|--------|-----------|-------------|
| `createFoodSale` | `(formData: FormData) => Promise<void>` | Logs one day's aggregate revenue entry |
| `createFoodInventoryItem` | `(formData: FormData) => Promise<void>` | Adds an insumo (accepts `category`: `EDIBLE`\|`NON_EDIBLE`) |
| `createFoodSupplier` | `(formData: FormData) => Promise<void>` | Adds a supplier contact |
| `createFoodDish` / `updateFoodDish` | `(dishId?, data: { name, categoryId?, modifierGroupIds?, variants: [{ label, price, ingredients: [{inventoryItemId, quantity}] }] }) => Promise<void>` | Creates/replaces a dish, its category assignment, its modifier-group links, and all its variants+recipes in one transaction |
| `toggleFoodDishActive` | `(dishId: string, isActive: boolean) => Promise<void>` | Soft-disable — dishes are never hard-deleted |
| `createFoodOperatingCost` / `updateFoodOperatingCost` / `toggleFoodOperatingCostActive` | see signatures in code | Fixed monthly cost CRUD |
| `logFoodDishSales` | `(data: { date: string, entries: [{variantId, quantity}] }) => Promise<void>` | Upserts per-variant daily units sold — **replaces**, not adds, on re-save |
| `updateFoodTargetCostPct` | `(pct: number) => Promise<void>` | Sets `Organization.foodTargetCostPct` (1–90), feeds the price recommendation formula |
| `createFoodDishCategory` / `updateFoodDishCategory` | `(id?, data: { name, sortOrder? }) => Promise<void>` | Menu category CRUD (Fase 17) |
| `deleteFoodDishCategory` | `(categoryId: string) => Promise<void>` | Genuine hard delete — see §4 for why this one entity doesn't soft-disable |
| `createFoodModifierGroup` / `updateFoodModifierGroup` | `(id?, data: { name, minSelect, maxSelect, options: [{name, priceDelta}] }) => Promise<void>` | Modifier group CRUD (Fase 17); update fully replaces the option list in a transaction, same pattern as dish variants |
| `deleteFoodModifierGroup` | `(groupId: string) => Promise<void>` | Genuine hard delete — cascades to its options and any dish links |

---

## 11. Template Engine

### AutomationTemplate Lifecycle

```
DRAFT (isPublished: false)
  │
  ├── addTemplateVersion() ──→ TemplateVersion created (isLatest: true)
  │
  └── publishTemplate()  ──→ isPublished: true (requires at least 1 version)
                                │
                                ▼
                         PUBLISHED (visible in marketplace)
                                │
                                ├── installTemplate() (client self-service)
                                │     or
                                └── installTemplateForClient() (admin)
                                          │
                                          ▼
                                 TemplateInstallation (ACTIVE)
                                 + Automation (ACTIVE)
```

### TemplateVersion Semver

Version strings must match the regex `/^\d+\.\d+\.\d+$/` (e.g., `1.0.0`, `2.3.1`). The version is unique per template (`@@unique([templateId, version])`).

When adding a new version via `addTemplateVersion()`, a single `$transaction` ensures atomicity:

```typescript
await prisma.$transaction([
  // 1. Mark all existing versions as not latest
  prisma.templateVersion.updateMany({
    where: { templateId },
    data: { isLatest: false },
  }),
  // 2. Create new version as latest
  prisma.templateVersion.create({
    data: { ..., isLatest: true },
  }),
  // 3. Update currentVersion pointer on the template
  prisma.automationTemplate.update({
    where: { id: templateId },
    data: { currentVersion: parsed.version },
  }),
]);
```

### TemplateInstallation Uniqueness Constraint

`@@unique([organizationId, templateId])` means one org can only have one installation record per template. The status field (`ACTIVE` / `UNINSTALLED`) tracks whether the template is currently active.

**Re-installation behavior:**
- If an existing record with status `UNINSTALLED` is found, it is **updated** (not a new record created).
- If status is `ACTIVE`, an error is thrown: "Este template ya está instalado."

### Install Flow

When a client installs a template:

1. Find the published template and its latest version.
2. Check for existing installation (throw if already ACTIVE).
3. Create an `Automation` record for the org (with `webhookSecret` generated via `crypto.getRandomValues()`).
4. Create or update a `TemplateInstallation` record with `status: "ACTIVE"` and a reference to the new Automation's ID.
5. Log an audit event: `action: "template.install"`.
6. Revalidate `/portal/templates` and `/portal/automations` paths.

### Uninstall Flow

When a client uninstalls a template:

```typescript
await prisma.$transaction([
  // Mark installation as UNINSTALLED
  prisma.templateInstallation.update({
    where: { id: installation.id },
    data: { status: "UNINSTALLED" },
  }),
  // Archive the associated Automation (if automationId exists)
  prisma.automation.update({
    where: { id: installation.automationId },
    data: { status: "ARCHIVED" },
  }),
]);
```

### Template Packages (Fase 12)

`TemplatePackage` + `TemplatePackageItem` group existing `AutomationTemplate`s into a curated,
industry-tagged bundle — e.g. "Paquete inicial de Clínica" = the 2 templates a clinic typically wants
on day one. A package doesn't duplicate anything about its member templates (no separate workflow
JSON, no separate versioning); it's an ordered join table (`TemplatePackageItem.order`) an admin
curates via `/admin/template-packages`, the same create/edit/publish lifecycle as a single template
(`createTemplatePackage()` / `updateTemplatePackageItems()` / `publishTemplatePackage()` in
`src/actions/admin/template-packages.ts`).

Installing a package (`installTemplatePackage()`, `src/actions/templates.ts`) loops its items through
the **exact same** `installTemplateCore()` helper `installTemplate()` itself calls — extracted
specifically so a bulk install can never diverge from a single install's module/plan-capacity checks
or the `TemplateInstallation` row it produces:

```typescript
for (const item of pkg.items) {
  if (!item.template.isPublished) continue; // an unpublished member is silently skipped, not installed
  const existing = await prisma.templateInstallation.findUnique(...);
  if (existing?.status === "ACTIVE") { skippedCount++; continue; }
  try {
    await installTemplateCore(orgId, session.user.id, item.template.id);
    installedCount++;
  } catch {
    limitReached = true; // assertPlanCapacity() is the only thing that throws here
    break;
  }
}
```

Hitting the plan's automation limit mid-package **stops rather than throws** — the caller gets back
`{installedCount, skippedCount, limitReached}` and the client sees exactly how many templates made it
in, never a half-applied bulk action reported as a hard failure. `/portal/templates` sorts published
packages so ones matching the org's own `Organization.industry` lead the row (badge: "Tu industria"),
matching the roadmap's "paquetes **por industria**" — the client sees their own bundle first, not a
generic list mixed across every industry Reymen sells to.

**Closing a real module-gating gap:** `/portal/templates` had no `requireModule()` call at all before
Fase 12, despite every install always requiring `AUTOMATIONS` (enforced only inside the action) — an
org without that module could browse the whole marketplace and get nothing but a thrown-error toast on
install. Fase 12 added `requireModule(orgId, "AUTOMATIONS")` to the page and `module: "AUTOMATIONS"`
to its `PortalSidebar` nav entry, the same gate every other `AUTOMATIONS`-scoped page already has.
Verified live by suspending `AUTOMATIONS` for a real org and confirming both the nav link disappeared
and a direct hit on `/portal/templates` redirected to `/portal/dashboard`.

---

## 12. Audit System

### logAudit() Signature

```typescript
// src/lib/audit.ts
export async function logAudit(params: {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void>
```

### Fire-and-Forget Pattern

The `logAudit()` function wraps the Prisma call in a `try/catch` that silently swallows errors:

```typescript
try {
  await prisma.auditLog.create({ data: { ... } });
} catch {
  // Audit failures must never break the main operation
}
```

This is intentional: if the audit log write fails (e.g., DB connection hiccup), the primary business operation (creating a lead, changing a plan) must still succeed. The audit trail is important but not mission-critical.

Note that `logAudit` is marked `"use server"` and is always called from within a Server Action — never from the client side.

### AuditLog Schema

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | `String?` | Tenant context (null for platform-level events) |
| `userId` | `String?` | Who performed the action |
| `action` | `String` | Event identifier (dot-notation convention) |
| `resource` | `String` | Entity type affected |
| `resourceId` | `String?` | ID of the affected entity |
| `metadata` | `Json?` | Action-specific context data |
| `ipAddress` | `String?` | Reserved for future use |
| `createdAt` | `DateTime` | Auto-set to `now()` |

### All Tracked Events

| Action | Resource | Where called | Metadata |
|--------|----------|-------------|----------|
| `lead.create` | `Lead` | `createLead()` | `{ name, source }` |
| `lead.delete` | `Lead` | `deleteLead()` | — |
| `client.create` | `Organization` | `createClient()` | `{ name, slug }` |
| `client.plan_change` | `Organization` | `changePlan()` | `{ newPlan }` |
| `team.invite` | `User` | `inviteTeamMember()` | `{ email, role }` |
| `team.remove` | `User` | `removeTeamMember()` | `{ email }` |
| `template.install` | `TemplateInstallation` | `installTemplate()` | `{ templateName, version }` |
| `template.uninstall` | `TemplateInstallation` | `uninstallTemplate()` | — |

---

## 13. Environment Variables

> Updated after the security review and per-organization webhook secret migration
> (see [§8 Webhook Security](#8-webhook-security)). The old global `WEBHOOK_SECRET`
> and `KNOWLEDGE_BASE_API_KEY` variables described in earlier drafts of this document
> **no longer exist** — inbound webhook/API-key auth is now validated per-organization
> against `Organization.n8nWebhookSecret` in the database (rotatable from the admin
> client detail page), not a shared env var. Treat this section, not any cached
> copy, as the source of truth.

### Core — the app will not start or will be actively insecure without these

| Variable | Required | What breaks without it |
|----------|----------|-------------------------|
| `DATABASE_URL` | Yes | App cannot start; Prisma has no database to connect to. |
| `AUTH_SECRET` (`NEXTAUTH_SECRET` also accepted, for back-compat with older Auth.js configs) | Yes | Session/JWT signing has no key. Auth.js refuses to start in production without one; in dev it falls back to an insecure generated value and logs a warning — never rely on that fallback in production. Generate with `openssl rand -base64 32`. |
| `N8N_BASE_URL` | Yes | Platform → n8n calls (triggering automations) have nowhere to go. Use the Docker service name in containerized environments (`http://n8n:5678`), not `localhost`. |
| `N8N_WEBHOOK_SECRET` | Yes | Used only for **outbound** HMAC signatures on platform → n8n calls (`src/lib/n8n.ts`). n8n must be configured with the same value to verify them. This is unrelated to the per-organization secret used for **inbound** n8n → platform webhooks — see below. |
| `NEXT_PUBLIC_APP_URL` | Yes | Baked into emails (password reset links, notifications) and absolute links. Wrong value silently produces broken links, not an error. |

### Auth / reverse proxy

| Variable | Required | What breaks without it |
|----------|----------|-------------------------|
| `AUTH_TRUST_HOST` | Production only, and only when the app sits behind a reverse proxy or load balancer (Nginx, an ALB, etc.) | Without it, `next start` in production rejects every request with `UntrustedHost: Host must be trusted`, because Auth.js refuses to trust the incoming `Host` header by default. **Only set `AUTH_TRUST_HOST=true` when that proxy is trusted to set an accurate `Host`/`X-Forwarded-Host`** — enabling it on an app directly reachable from the internet (no proxy in front) lets a client spoof its own Host header. |
| `NEXTAUTH_URL` | Production only | Without it, some Auth.js redirect/callback URLs can be inferred incorrectly. In development this is inferred from the request and can be omitted. |

### Per-organization webhook secret (replaces the old global `WEBHOOK_SECRET`)

Inbound n8n → platform webhooks (`/api/webhooks/n8n/{leads,conversations,scoring}`) and the
`/api/v1/knowledge-base` API-key route are authenticated per-organization against
`Organization.n8nWebhookSecret`, a unique value stored in the database and generated
automatically when a client organization is created. **There is no env var to configure
for this** — it's managed entirely from `/admin/clients/[clientId]` (view/rotate dialog).
If an organization's secret is compromised, rotate it there; the old value stops working
immediately.

### Optional — feature stays cleanly disabled/hidden without these, nothing crashes

| Variable | Gates | What happens without it |
|----------|-------|--------------------------|
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email (password reset, notifications) | Without `RESEND_API_KEY`, emails are logged to the console instead of sent — password reset and notification flows still "succeed" but no email arrives. Set both before relying on email in production. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PROFESSIONAL` / `STRIPE_PRICE_ENTERPRISE` | Billing (upgrade/manage-billing UI, Stripe webhook route) | Without `STRIPE_SECRET_KEY`, the upgrade/manage-billing UI stays hidden. `STRIPE_WEBHOOK_SECRET` gates `/api/webhooks/stripe`; without it that route rejects incoming Stripe events. |
| `SENTRY_DSN` (server) / `NEXT_PUBLIC_SENTRY_DSN` (client) | Error tracking | Without these, `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation-client.ts` initialize Sentry with no DSN, so error capture is a no-op — errors are only visible in server logs, not in Sentry. Not knowing about this in production means silently losing visibility into crashes. |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Source map upload at build time | Build-time only, unrelated to runtime error capture. Without them, Sentry still receives errors (if `SENTRY_DSN` is set) but stack traces point at minified code instead of original source. |
| `BANXICO_TOKEN` / `MXN_PER_USD` | ROI in Reports (`src/lib/exchange-rate.ts`, `src/lib/roi.ts`) | The MXN/USD rate is fetched automatically (cached 6 h): Banxico's official FIX rate when `BANXICO_TOKEN` is set, otherwise Frankfurter (European Central Bank data, no key). `MXN_PER_USD` is only a manual fallback when the source doesn't respond. With none available, MXN opportunities are left out of the ROI and the card shows a warning — there is deliberately no hardcoded default rate. |
| `NEXT_PUBLIC_APP_NAME` | Branding text | Falls back to a hardcoded default app name. |

### SmartCard bridge (Fase 14) — a different pattern from everything else in this table

Every other integration in this document talks to n8n via HMAC-signed HTTP. SmartCard is not
that: it reads **directly from `reymen-smartcard`'s own Supabase project** (a separate repo,
Supabase Auth instead of this app's NextAuth) — a shared-database integration, not a webhook one.

| Variable | Required | What breaks without it |
|----------|----------|--------------------------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Only for the `NFC_QR` module's live stats (card scans, WhatsApp clicks) | Must be the **exact same Supabase project** `reymen-smartcard` itself uses — this app is reading that repo's tables, not its own. Without them, `getSmartcardCompanyIdForOrg()`/`getCompanyCardStats()` return `null`/empty and the SmartCard dashboard widget just shows zeros, nothing crashes. |
| `SMARTCARD_PUBLIC_URL` | No — defaults to `https://link.reymen.mx` | Base URL encoded in each card's QR (`{url}/q/{card_code}`, see `buildSmartcardPublicUrl`). Only set it if the cards' public domain changes. |
| `SMARTCARD_SSO_SECRET` | Only for the "Ir a SmartCard" single-sign-on hand-off | Must equal the same-named var in the `reymen-smartcard` repo — it verifies the signed, 60-second-TTL token minted by `createSmartcardSsoToken()` (`src/lib/smartcard-sso.ts`). Without it (or a mismatch), the redirect fails to sign the user in there. |
| `SMARTCARD_OPS_URL` | Only for the SSO redirect | The public URL of the `reymen-smartcard` ops app (e.g. `https://ops.reymen.mx`) the token redirects to. |

### Required for a specific endpoint (fails closed, not silently disabled)

| Variable | Required for | What breaks without it |
|----------|---------------|--------------------------|
| `CRON_SECRET` | `POST /api/cron/retry-webhooks` (scheduled webhook retry) | The route returns `401 Unauthorized` with `"CRON_SECRET not configured"` if unset — **it fails closed, not open**. Whatever scheduler calls this endpoint (cron on the VPS, a platform's scheduled-job feature) must send it as a bearer token/header matching this value. Without it configured, the webhook retry mechanism silently never runs. |

### Deployment checklist

Before going to production, confirm:

- [ ] `DATABASE_URL` points at the production database, not a local/dev one.
- [ ] `AUTH_SECRET` is a freshly generated value (`openssl rand -base64 32`), not reused from a dev `.env`.
- [ ] `AUTH_TRUST_HOST=true` is set **if and only if** a trusted reverse proxy/load balancer sits in front of the app; confirm the proxy strips/overwrites any client-supplied `X-Forwarded-Host` before it reaches the app.
- [ ] `N8N_BASE_URL` uses the internal/container network address n8n is actually reachable at from the app's runtime environment.
- [ ] `N8N_WEBHOOK_SECRET` matches what's configured on the n8n side for outbound signature verification.
- [ ] `NEXT_PUBLIC_APP_URL` is the real public URL (affects every link in every email sent).
- [ ] `RESEND_API_KEY` is set if email delivery is expected to actually work (otherwise emails silently just log to console).
- [ ] `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set if you want production errors to show up anywhere other than server logs.
- [ ] `CRON_SECRET` is set and the scheduler calling `/api/cron/retry-webhooks` is configured with the matching value — otherwise failed webhook deliveries never retry.
- [ ] Stripe vars are set together (all four) if billing is meant to be live; a partially-configured set (e.g. `STRIPE_SECRET_KEY` without `STRIPE_WEBHOOK_SECRET`) can accept payments UI-side while silently failing to process the webhook that confirms them.
- [ ] Each client organization's `n8nWebhookSecret` (auto-generated on creation) has been shared with whoever configures that org's n8n workflows — there's no shared/global fallback anymore.

---

## 14. Local Development Setup

### Prerequisites

- **Node.js** 20 or higher (22 recommended, matches Docker)
- **Docker** and **Docker Compose** (for PostgreSQL and n8n)
- **npm** or compatible package manager

### Step-by-Step Setup

#### 1. Clone the repository

```bash
git clone https://github.com/ReymenSolutions/ReymenApp.git
cd ReymenApp
```

#### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/reymen_ops"
AUTH_SECRET="your-random-secret-min-32-chars"
N8N_BASE_URL="http://localhost:5678"
N8N_WEBHOOK_SECRET="your-64-char-hex-webhook-secret"
NEXTAUTH_URL="http://localhost:3000"
```

#### 3. Start infrastructure services

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts:
- **PostgreSQL 16** on port `5432` (database: `reymen_ops`)
- **n8n** on port `5678` (admin: `admin` / `changeme`)

Wait for services to be healthy (10-15 seconds).

#### 4. Run database migrations

```bash
npm run db:migrate
```

This applies all Prisma migrations and generates the Prisma client.

#### 5. Seed the database

```bash
npm run db:seed
```

This creates:
- Admin user: `admin@reymen.io` / `admin123456`
- Demo client (Clínica San Rafael): `carlos@clinicasanrafael.com` / `client123456`
- Sample leads, automations, conversations, appointments
- WhatsApp assistant configuration
- Knowledge base articles
- Prompts
- 6 automation templates

#### 6. Install dependencies and start dev server

```bash
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.

### Demo Credentials

| Role | Email | Password | Access |
|------|-------|----------|--------|
| SUPER_ADMIN | `admin@reymen.io` | `admin123456` | `/admin/*` |
| OWNER (client) | `carlos@clinicasanrafael.com` | `client123456` | `/portal/*` |

### Useful npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:push` | Push schema changes without migrations (dev only) |
| `npm run db:migrate` | Run migrations and generate client |
| `npm run db:seed` | Seed database with demo data |
| `npm run db:studio` | Open Prisma Studio (database browser GUI) |

---

## 15. Docker Deployment

### Development Docker Setup

**File:** `docker/docker-compose.yml`

Starts PostgreSQL and n8n only (the Next.js app runs on the host via `npm run dev`).

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: reymen_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: reymen_ops
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: ...

  n8n:
    image: n8nio/n8n:latest
    container_name: reymen_n8n
    environment:
      N8N_HOST: 0.0.0.0
      N8N_PORT: 5678
      N8N_BASIC_AUTH_ACTIVE: true
      N8N_BASIC_AUTH_USER: admin
      N8N_BASIC_AUTH_PASSWORD: changeme
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      # ... (n8n uses the same postgres instance, different DB)
    ports: ["5678:5678"]
    depends_on: postgres (service_healthy)
```

### Production Docker Setup

**File:** `docker/docker-compose.prod.yml`

Full production stack: app + postgres + n8n + nginx + certbot (Let's Encrypt).

```yaml
services:
  app:          # Next.js app built from Dockerfile
  postgres:     # PostgreSQL 16 (env from .env)
  n8n:          # n8n (env from .env.n8n)
  nginx:        # Reverse proxy with TLS termination
  certbot:      # Let's Encrypt certificate management
```

Key differences from dev:
- App is containerized (not running on host).
- `env_file: ../.env` loads all environment variables from `.env`.
- Nginx handles TLS on ports 80 and 443.
- certbot volumes share certificate storage with nginx.

### Dockerfile (Multi-Stage Build)

**File:** `docker/Dockerfile`

```dockerfile
# Stage 1: deps — install node_modules only
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: builder — generate Prisma client and build Next.js
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: runner — minimal production image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# Copy only the production artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

**Key design decisions:**
- Three stages minimize final image size (only production artifacts in the runner).
- Runs as non-root user `nextjs` (UID 1001) for security.
- Requires `output: 'standalone'` in `next.config.ts` for the `node server.js` command.
- Prisma client is generated during build (not at runtime).

### OVH VPS Deployment Notes

When deploying to an OVH VPS (or any Linux VPS):

1. **Point your domain DNS** to the VPS IP.
2. **Configure Nginx** (`docker/nginx.conf`) with your domain name.
3. **Obtain SSL certificate** via certbot:
   ```bash
   docker compose -f docker/docker-compose.prod.yml run --rm certbot certonly \
     --webroot -w /var/www/certbot -d yourdomain.com
   ```
4. **Set production env vars** in `.env` and `.env.n8n`.
5. **Run migrations** before starting the app:
   ```bash
   docker compose -f docker/docker-compose.prod.yml run --rm app \
     npx prisma migrate deploy
   ```
6. **Start all services:**
   ```bash
   docker compose -f docker/docker-compose.prod.yml up -d
   ```

---

## 16. Directory Structure

```
ReymenApp/
├── docker/
│   ├── docker-compose.yml          # Dev: postgres + n8n only
│   ├── docker-compose.prod.yml     # Prod: app + postgres + n8n + nginx + certbot
│   └── Dockerfile                  # Multi-stage production build
├── prisma/
│   ├── schema.prisma               # Complete database schema
│   └── seed.ts                     # Demo data seeder (tsx)
├── src/
│   ├── actions/                    # Next.js Server Actions ("use server")
│   │   ├── admin/
│   │   │   ├── clients.ts          # createClient, changePlan, updateClientStatus, assignAutomation
│   │   │   ├── users.ts            # createOrgUser, updateOrgUser, setUserActive, createStandaloneUser, getAllUsers
│   │   │   └── templates.ts        # createTemplate, publishTemplate, addTemplateVersion, installTemplateForClient
│   │   ├── ai-lab.ts               # sandbox sessions, test cases, A/B experiments (Fase 7)
│   │   ├── appointments.ts         # createAppointment, updateAppointmentStatus
│   │   ├── conversations.ts        # escalateConversation, resolveConversation
│   │   ├── food.ts                 # dish/variant/recipe CRUD, operating costs, dish sales log (Fases 14–16)
│   │   ├── knowledge-base.ts       # createArticle, updateArticle, deleteArticle, toggleArticle
│   │   ├── leads.ts                # createLead, updateLeadStatus, deleteLead
│   │   ├── onboarding.ts           # skipOnboarding() (Fase 10)
│   │   ├── prompts.ts              # createPrompt, updatePrompt, activatePrompt, deletePrompt, listPromptVersions, rollbackPromptVersion
│   │   ├── requests.ts             # createRequest, updateRequestStatus
│   │   ├── team.ts                 # inviteTeamMember, removeTeamMember
│   │   ├── templates.ts            # installTemplate, uninstallTemplate (portal)
│   │   └── whatsapp-assistant.ts   # upsertWhatsAppAssistant, toggleAssistant
│   ├── app/
│   │   ├── (admin)/                # Admin route group
│   │   │   ├── admin/
│   │   │   │   ├── api-docs/       # Webhook reference page
│   │   │   │   ├── audit/          # Audit log viewer
│   │   │   │   ├── automations/    # Global automations list
│   │   │   │   ├── clients/        # Client management + [clientId] detail
│   │   │   │   ├── dashboard/      # Admin KPIs
│   │   │   │   ├── escalations/    # Escalated conversations
│   │   │   │   ├── metrics/        # Global charts
│   │   │   │   ├── requests/       # All client requests
│   │   │   │   ├── settings/       # System stats + env vars
│   │   │   │   ├── templates/      # Template management + [templateId] detail
│   │   │   │   └── users/          # Global user directory (org-bound + standalone, Fase 15)
│   │   │   └── layout.tsx          # Admin layout with AdminSidebar
│   │   ├── (auth)/                 # Auth route group (public)
│   │   │   ├── login/page.tsx      # Login form
│   │   │   └── layout.tsx          # Centered auth layout
│   │   ├── (portal)/               # Portal route group
│   │   │   ├── portal/
│   │   │   │   ├── appointments/   # Appointment calendar/list
│   │   │   │   ├── automations/    # Automation list + [id] detail
│   │   │   │   ├── conversations/  # Conversation list + [id] thread
│   │   │   │   ├── ai-lab/         # Sandbox, test cases, A/B experiments (Fase 7)
│   │   │   │   ├── dashboard/      # Client KPI dashboard
│   │   │   │   ├── food/           # Sales, inventory, suppliers, recipes, profitability (Fases 14–16)
│   │   │   │   │   ├── recipes/        # Dish + variant CRUD, daily units-sold entry
│   │   │   │   │   └── profitability/  # Fixed costs, break-even, net profit, price calculator
│   │   │   │   ├── knowledge-base/ # KB article management
│   │   │   │   ├── leads/          # Lead CRM table
│   │   │   │   ├── onboarding/     # Real, module-aware setup checklist (Fase 10)
│   │   │   │   ├── prompts/        # Prompt management
│   │   │   │   ├── reports/        # Charts + ROI calculator
│   │   │   │   ├── requests/       # Support requests
│   │   │   │   ├── settings/       # Org config + team management
│   │   │   │   ├── smartcard/      # Native SmartCard panel + SSO hand-off (Fase 14)
│   │   │   │   ├── templates/      # Template marketplace
│   │   │   │   └── whatsapp/       # WhatsApp AI config
│   │   │   └── layout.tsx          # Portal layout with PortalSidebar
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/ # NextAuth handlers
│   │   │   ├── portal/leads/export/ # CSV export route
│   │   │   ├── v1/food/menu/       # Menu projection (dishes+variants+category+modifiers) for a POS
│   │   │   ├── v1/knowledge-base/  # Dual-auth KB query endpoint
│   │   │   ├── webhooks/pos/orders/ # POS order-ingestion webhook (Fase 17, not n8n)
│   │   │   └── webhooks/n8n/
│   │   │       ├── automations/    # Receive automation events
│   │   │       ├── conversations/  # Receive conversation messages
│   │   │       ├── leads/          # Receive new leads
│   │   │       └── scoring/        # Receive AI lead scores
│   │   ├── globals.css             # Global Tailwind base styles
│   │   ├── layout.tsx              # Root layout (html, body, Sonner toaster)
│   │   └── page.tsx                # Root redirect (→ /portal/dashboard)
│   ├── components/
│   │   ├── admin/                  # Admin-only components
│   │   │   ├── AddVersionDialog.tsx        # Add template version form
│   │   │   ├── AdminSidebar.tsx            # Admin navigation sidebar
│   │   │   ├── ChangePlanDialog.tsx        # Plan change confirmation
│   │   │   ├── CreateClientDialog.tsx      # New org + user form
│   │   │   ├── CreateTemplateDialog.tsx    # New template form
│   │   │   ├── InstallForClientDialog.tsx  # Admin template install
│   │   │   ├── PublishTemplateButton.tsx   # Publish/unpublish toggle
│   │   │   └── UpdateRequestStatusSelect.tsx # Inline status updater
│   │   ├── charts/                 # Recharts-based chart components
│   │   │   ├── AutomationHealthChart.tsx   # Bar chart: active/error/archived
│   │   │   ├── LeadFunnelChart.tsx         # Funnel chart: lead stages
│   │   │   └── LeadTrendChart.tsx          # Line chart: leads over time
│   │   ├── portal/                 # Portal-specific interactive components
│   │   │   ├── ActivatePromptButton.tsx    # Activate prompt with transition
│   │   │   ├── AppointmentStatusSelect.tsx # Status dropdown for appointments
│   │   │   ├── ArticleDialog.tsx           # Create/edit KB article modal
│   │   │   ├── AssistantConfigForm.tsx     # WhatsApp assistant config form
│   │   │   ├── AssistantToggle.tsx         # Activate/deactivate bot switch
│   │   │   ├── ConversationActions.tsx     # Escalate/resolve buttons
│   │   │   ├── CopyButton.tsx              # Copy-to-clipboard utility
│   │   │   ├── CreateAppointmentDialog.tsx # New appointment form modal
│   │   │   ├── CreateLeadDialog.tsx        # New lead form modal
│   │   │   ├── CreateRequestDialog.tsx     # New request form modal
│   │   │   ├── DeleteArticleButton.tsx     # KB article delete with confirm
│   │   │   ├── ExportLeadsButton.tsx       # Triggers CSV download
│   │   │   ├── InstallTemplateButton.tsx   # 1-click template install
│   │   │   ├── InviteUserForm.tsx          # Team member invitation form
│   │   │   ├── LeadActions.tsx             # Lead status update dropdown
│   │   │   ├── LeadTableClient.tsx         # Client-side sortable lead table
│   │   │   ├── PortalSidebar.tsx           # Portal navigation sidebar
│   │   │   ├── PromptDialog.tsx            # Create/edit prompt modal
│   │   │   ├── RemoveUserButton.tsx        # Team member removal
│   │   │   ├── RoiCalculator.tsx           # Interactive ROI simulator
│   │   │   └── TemplateFilters.tsx         # Industry/category filter bar
│   │   ├── shared/                 # Shared across admin and portal
│   │   │   ├── EmptyState.tsx              # Empty list placeholder
│   │   │   ├── LeadScoreBadge.tsx          # Colored badge for AI score
│   │   │   ├── MetricCard.tsx              # KPI card component
│   │   │   ├── PageHeader.tsx              # Page title + action button
│   │   │   ├── StatusBadge.tsx             # Colored status pill
│   │   │   └── TopBar.tsx                  # Top navigation bar
│   │   └── ui/                     # Base Radix UI primitive wrappers
│   │       ├── badge.tsx, button.tsx, card.tsx, dialog.tsx
│   │       ├── input.tsx, label.tsx, select.tsx, separator.tsx
│   │       └── textarea.tsx
│   ├── lib/
│   │   ├── ai-lab.ts               # runAiLabInference(), matchKnowledgeBaseContext() (Fase 7)
│   │   ├── audit.ts                # logAudit() fire-and-forget
│   │   ├── auth.ts                 # NextAuth config, isAdmin(), isClientRole()
│   │   ├── metrics.ts              # recordMetric(), METRIC_KEYS, monthPeriod() (Fase 9)
│   │   ├── onboarding.ts           # getOnboardingStatus() (Fase 10)
│   │   ├── n8n.ts                  # triggerN8nWorkflow() outbound client, triggerN8nWorkflowSync() (Fase 7)
│   │   ├── permissions.ts          # can(), PLAN_LIMITS, PLAN_PRICES, ROLE_PERMISSIONS
│   │   ├── prisma.ts               # Prisma singleton client
│   │   ├── roi.ts                  # getRoiData() — real revenue from won Opportunities (Fase 11)
│   │   ├── tenant.ts               # getOrganizationBySlug/Id(), assertOrgAccess()
│   │   ├── utils.ts                # cn(), formatDate(), generateSlug(), generateWebhookSecret()
│   │   └── webhook-validator.ts    # verifyWebhookSignature(), createWebhookSignature()
│   ├── proxy.ts                    # Route guard: auth + role enforcement
│   └── types/
│       ├── api.ts                  # API response type definitions
│       └── domain.ts               # Domain model type aliases
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

---

## 17. Key Patterns

### 1. Atomic Prompt Activation via $transaction

Only one prompt per type per organization can be active. The `activatePrompt()` server action uses a `$transaction` to guarantee atomicity:

```typescript
await prisma.$transaction([
  // First: deactivate ALL prompts of this type for the org
  prisma.prompt.updateMany({
    where: { organizationId: session.user.organizationId, type },
    data: { isActive: false },
  }),
  // Second: activate only the target prompt
  prisma.prompt.update({
    where: { id },
    data: { isActive: true },
  }),
]);
```

Without the transaction, a race condition could leave two prompts active simultaneously.

### 2. Soft Deletes on Lead

Leads are never hard-deleted. Instead, `deletedAt` is set to `new Date()`:

```typescript
await prisma.lead.update({
  where: { id: leadId },
  data: { deletedAt: new Date() },
});
```

All portal queries filter for `deletedAt: null` (or `where: { deletedAt: null }`). The CSV export also excludes soft-deleted leads. The admin audit log retains the deletion event.

### 3. Compound Unique Constraints

Several models use compound unique constraints to enforce business rules at the database level:

| Model | Constraint | Business rule |
|-------|-----------|---------------|
| `Metric` | `[organizationId, key, period]` | One metric value per org/key/period |
| `TemplateVersion` | `[templateId, version]` | No duplicate semver within a template |
| `TemplateInstallation` | `[organizationId, templateId]` | One installation record per org/template |
| `Account` (NextAuth) | `[provider, providerAccountId]` | One OAuth account per provider |
| `Lead` | `[organizationId, externalId]` | Nullable idempotency key — see §8 Idempotency |
| `Message` | `[conversationId, externalId]` | Same, scoped to the conversation |
| `WebhookEvent` | `[organizationId, source, externalEventId]` | Delivery-level idempotency key |
| `OrganizationModule` | `[organizationId, module]` | One entitlement row per org/module |

Every one of these idempotency-key columns is nullable, and Postgres unique indexes
treat `NULL` as distinct from every other `NULL` — so rows that don't supply the key
(most rows, for `externalId`/`externalEventId`) never collide with each other; the
constraint only ever fires once a caller actually reuses the same non-null key.

### 3b. Concurrency Control: Serializable Transactions for Slot Booking

`createAppointment` (`src/actions/appointments.ts`) prevents double-booking with a
`Prisma.TransactionIsolationLevel.Serializable` transaction, not just a
check-then-insert under the default Read Committed isolation:

```typescript
await prisma.$transaction(async (tx) => {
  const overlapping = await tx.appointment.findFirst({
    where: { organizationId, status: { in: ["SCHEDULED", "CONFIRMED"] }, startTime: { lt: end }, endTime: { gt: start } },
  });
  if (overlapping) throw new Error("Ese horario ya está ocupado por otra cita.");
  await tx.appointment.create({ data: { ... } });
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

Under Read Committed, two concurrent requests for the same slot can both pass the
overlap check before either commits (classic TOCTOU race) — Serializable makes
Postgres itself detect that conflict and abort one transaction with a `40001`
serialization failure (surfaced by Prisma as error code `P2034`), which the action
catches and reports as the same "slot taken" error rather than a generic 500.

### 4. CSV Export Route Pattern

The leads CSV export follows a clean Route Handler pattern:

```typescript
// src/app/api/portal/leads/export/route.ts
export async function GET() {
  const session = await auth();
  // 1. Auth check
  if (!session?.user.organizationId) return 401;
  
  // 2. Query data (org-scoped)
  const leads = await prisma.lead.findMany({ where: { organizationId, deletedAt: null } });
  
  // 3. Build CSV string with proper escaping
  const csv = buildCsv(leads);
  
  // 4. Return with download headers
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
    },
  });
}
```

The `escapeCsv()` helper wraps values containing commas, quotes, or newlines in double-quotes and doubles any internal quotes (RFC 4180 compliant).

### 5. Client Components for Interactivity

The codebase uses Next.js Server Components by default (no `"use client"` directive). Client Components are used only where interactivity is required:

- `LeadTableClient.tsx` — sortable table with filter state
- `RoiCalculator.tsx` — real-time calculation with local state
- `TemplateFilters.tsx` — filter state management
- `AssistantConfigForm.tsx` — form with react-hook-form
- All dialog components (need DOM event handlers)

This maximizes server-side rendering and reduces client-side JavaScript bundle size.

### 6. WebhookSecret Per Automation

Every `Automation` record has its own `webhookSecret` field (32 random bytes as hex):

```typescript
export function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array); // Web Crypto API (available in Node.js 18+)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

This allows each automation to have an independent secret for per-automation webhook authentication (reserved for future use; the current implementation uses the platform-level `N8N_WEBHOOK_SECRET` for all inbound webhooks).

### 7. Module-Aware Admin Screens (Fase 8)

The commercial module system (§1's `PlatformModule`/`OrganizationModule`, `src/lib/modules.ts`) was
introduced in Fase 1 for the **portal** side (`requireModule()`/`assertModuleEnabled()` gate portal
pages and Server Actions) but the **admin** side — `/admin/clients/[clientId]`, the per-client
"operations center" Reymen staff use — kept showing every section (leads, automations,
conversations) unconditionally, regardless of which modules that org actually has `ACTIVE`. Fase 8
closed that gap using the exact same `getEnabledModules(orgId)` helper the portal already relies
on, with no new module-system code:

```typescript
const enabledModules = await getEnabledModules(clientId);
const hasModule = (m: PlatformModule) => enabledModules.includes(m);

{hasModule("CRM") && <LeadsStatCard />}
{hasModule("AUTOMATIONS") && <AutomationsPanel />}
{hasModule("AI_WHATSAPP") && <WhatsAppOperationsCard />}
```

A disabled module's section simply doesn't render — no placeholder, no "module not enabled"
message — mirroring how `PortalSidebar` already hides nav items for modules the org lacks (§16).
Verified live by suspending/reactivating each of an org's three modules in turn via
`OrganizationModule.status` and confirming the corresponding card/panel appeared and disappeared,
with the other two modules' sections unaffected.

The page also gained a **needs-attention summary** scoped to that one client: automations in
`ERROR` status (only counted if `AUTOMATIONS` is enabled), escalated conversations awaiting a human
(only if `AI_WHATSAPP` is enabled), and open requests (module-agnostic — `Request` isn't gated by
any module). All three reuse data the page already loads or a single added `count()` query; no new
models. A green "Todo en orden" card replaces the list when nothing needs attention.

### 8. Real, Module-Aware Onboarding (Fase 10)

`/portal/onboarding` existed since an earlier phase but was a hardcoded 3-step slideshow with no
persisted state — every step it showed was a fixed string (step 2 literally always said "Configura
tu Asistente de WhatsApp" and linked to `/portal/whatsapp`, even for an org without `AI_WHATSAPP`
enabled, which would have just bounced them via `requireModule()`), and there was **no link to it
anywhere in the app** (confirmed by grepping every `.tsx`/`.ts` file for the route — zero
references outside the page itself). Clicking "next" through it did nothing but advance local
`useState`; refreshing the page reset it to step 0 forever.

Fase 10 replaced it with `getOnboardingStatus()` (`src/lib/onboarding.ts`), which builds the
checklist from real data each time it's loaded — same "module gates the step, real data gates the
checkmark" combination as Fase 8:

```typescript
if (hasModule("AI_WHATSAPP")) {
  steps.push({ id: "whatsapp_assistant", ..., completed: whatsappAssistant?.isActive === true });
}
if (hasModule("CRM")) {
  steps.push({ id: "first_lead", ..., completed: leadCount > 0 });
}
if (hasModule("AUTOMATIONS")) {
  steps.push({ id: "first_automation", ..., completed: automationCount > 0 }); // excludes ARCHIVED
}
// Not module-gated — every org can invite teammates.
steps.push({ id: "invite_team", ..., completed: userCount > 1 });
```

`Organization.onboardingCompletedAt` (new nullable column) is set two ways: **automatically**, the
moment `getOnboardingStatus()` finds every applicable step already done (so an org that happened to
configure everything before ever opening this page doesn't keep getting nudged), or **explicitly**,
via `skipOnboarding()` (`src/actions/onboarding.ts`) — an opt-out for an org that doesn't want to
do every step. Both are real, persisted state, not a client-side flag that resets on refresh.

**Wired in, not orphaned:** a "Configuración inicial" item was added to `PortalSidebar` (always
visible, not module-gated — the page itself decides which steps to show), and `/portal/dashboard`
shows a dismiss-by-completing nudge banner (`{completedCount} de {totalCount} pasos completados`)
whenever `onboardingCompletedAt` is still null. Verified live against a genuinely fresh org (Taller
Automotriz Wolf, 0 leads/automations/assistant/extra-users at the time) walking through real portal
actions — creating a lead and inviting a teammate through the actual UI — and confirming the
checklist moved from "0 de 4" to "2 de 4" against the live database, not a mock.

### 9. Real ROI and an Actionable Client Dashboard (Fase 11)

`/portal/reports` had a "Simulador de ROI" (`RoiCalculator.tsx`) that was pure guesswork: a free-text
"average deal value" number input (defaulting to a made-up $5,000) multiplied by the count of leads
in `Lead.status = WON`, compared against a plan-price table (`starter: 299, professional: 699,
enterprise: 1499`) that was hardcoded inside that one client component and nowhere else — so the
"ROI" a client saw was never actually derived from money they'd recorded anywhere in the platform.

Fase 11 replaced the input with real numbers pulled from the sales pipeline itself. The CRM module
already has a real notion of a closed deal — an `Opportunity` sitting in a `PipelineStage` with
`isWon: true`, carrying its own `amount` and `closedAt` (set automatically by
`moveOpportunityStage()` the moment a rep drags/selects a deal into a won stage; see §11's actions
file). `src/lib/roi.ts`'s `getRoiData(organizationId, plan)` sums `Opportunity.amount` over won
opportunities — both all-time and over the last 30 days, matching the reports page's own existing
30-day window so the revenue figure is comparable to one month of subscription cost instead of
mixing an all-time sum against a single month's price:

```typescript
const [totals, last30] = await Promise.all([
  prisma.opportunity.aggregate({
    where: { organizationId, amount: { not: null }, pipelineStage: { isWon: true } },
    _sum: { amount: true }, _count: { id: true },
  }),
  prisma.opportunity.aggregate({
    where: { organizationId, amount: { not: null }, pipelineStage: { isWon: true }, closedAt: { gte: thirtyDaysAgo } },
    _sum: { amount: true }, _count: { id: true },
  }),
]);
const roi = planCost > 0 ? Math.round(((last30Revenue - planCost) / planCost) * 100) : null;
```

The plan-price table moved out of the component and into `PLAN_PRICES` in `src/lib/permissions.ts`,
next to the pre-existing `PLAN_LIMITS` — one canonical source for "what does this plan actually
cost," keyed off the org's real `Organization.plan`, not a dropdown the client could pick to flatter
their own number. `RoiCalculator.tsx` dropped `"use client"` entirely (there's no more local state to
manage) and renders whatever `getRoiData()` returns; an org with zero won-and-priced opportunities
gets an honest empty state pointing at `/portal/pipeline` instead of a chart built on a guess.

`/portal/reports` itself was never module-gated — it queried and rendered lead/automation charts
unconditionally even for an org without `CRM` or `AUTOMATIONS` enabled. Fase 11 wrapped the
CRM-derived sections (KPI cards, lead trend, funnel, leads-by-source, the ROI panel) in
`hasModule("CRM")` and the automation-health chart in `hasModule("AUTOMATIONS")`, the same pattern as
§7/§8. The appointments KPI stays ungated, matching `/portal/appointments` itself, which has never
been gated behind a `PlatformModule` (Agenda isn't one of the five module enum values).

**Actionable dashboard:** `/portal/dashboard` gained the same needs-attention block §8 built for the
admin client-operations screen — automation errors (`AUTOMATIONS`-gated), escalated conversations
(`AI_WHATSAPP`-gated), and open requests (module-agnostic) — reusing `getEnabledModules()` and a
`conversation.count({ status: "ESCALATED" })` query added alongside the page's existing metrics.
Unlike the admin version, each item here is a `<Link>` straight to the page where the client would
act on it (`/portal/automations`, `/portal/conversations`, `/portal/requests`), since this is the
client's own dashboard, not an admin's read-only summary — "accionable" means one click away, not
just visible.

Verified live: created a real pipeline stage marked `isWon`, created a real `Opportunity` with an
`amount` through the portal's own Pipeline UI (lead search, create-opportunity dialog), moved it into
the won stage via the opportunity card's stage selector (the same `moveOpportunityStage()` action a
real user triggers), and confirmed `/portal/reports` flipped from the "no hay oportunidades ganadas"
empty state to a real `$4,200` revenue figure and a real ROI percentage against that org's actual
Starter plan price — then deleted the test opportunity and stages to restore the org to its prior
state (it had no pipeline stages configured before this test, which is itself pre-existing state
across every seeded org, not something Fase 11 introduced or needed to fix).

### 10. Industry Packages Reusing the Single-Install Code Path (Fase 12)

`AutomationTemplate` has always been one workflow per template — there was no way to hand a client
several templates as one curated bundle, and `/portal/templates` had zero `PlatformModule` gating at
all (see §11's Fase 12 subsection for the module-gating gap this closed). Fase 12 added
`TemplatePackage`/`TemplatePackageItem` (§11) and, critically, made `installTemplatePackage()` share
its actual install logic with the pre-existing `installTemplate()` rather than reimplementing it — the
same trap `src/actions/admin/templates.ts`'s `installTemplateForClient()` already fell into by
duplicating `installTemplate()`'s body instead of calling it (a pre-existing inconsistency, not
touched here — out of scope for Fase 12). `installTemplateCore()` was pulled out specifically so this
wouldn't happen a third time:

```typescript
async function installTemplateCore(orgId, userId, templateId, config?) {
  // find template, check existing installation, assertPlanCapacity(), create Automation,
  // upsert TemplateInstallation, logAudit() — the one place this logic lives.
}

export async function installTemplate({ templateId, config }) {
  await assertModuleEnabled(orgId, "AUTOMATIONS");
  return installTemplateCore(orgId, userId, templateId, config); // single template
}

export async function installTemplatePackage(packageId) {
  await assertModuleEnabled(orgId, "AUTOMATIONS");
  for (const item of pkg.items) { /* ... */ await installTemplateCore(orgId, userId, item.template.id); }
}
```

A package install can partially succeed — the loop stops the moment `assertPlanCapacity()` throws
inside `installTemplateCore()`, and the action reports `{installedCount, skippedCount, limitReached}`
instead of losing the templates that did make it in behind a thrown error. Verified live end-to-end
as an admin (created a package through `/admin/template-packages`'s real create dialog, toggled it
published) and as a client (`/portal/templates` showed the org's own-industry package first with a
"Tu industria" badge, clicking "Instalar paquete" installed both member templates in one action) —
then reverted the installations and deleted the test package to restore both orgs to their seeded
baseline.

### 11. Plans Expressing Modules, Without Touching Billing (Fase 13)

The `ModuleSource` enum (§4) has carried a `SUBSCRIBED` value since Fase 1 with the schema comment
"tied to a paid plan (billing wiring not implemented yet)" — an admin could always *label* a module
grant as `SUBSCRIBED` vs `ADMIN_GRANTED` in `OrganizationModulesPanel`, but nothing actually tied that
label to what `Organization.plan` means. Fase 13 is that wiring — deliberately not the wiring you'd
guess (auto-toggling modules from the Stripe webhook). Rule 4 (Módulo/Industria/Rol never mix
automatically) and rule 8 (never auto-change entitlements) both rule that out, so this stays a
catalog + an explicit admin action, and the Stripe checkout/webhook code (`src/actions/billing.ts`,
`src/app/api/webhooks/stripe/route.ts`) is untouched — a plan change through Stripe still only ever
updates `Organization.plan`, exactly as before.

`PLAN_MODULES` (`src/lib/permissions.ts`, next to `PLAN_LIMITS`/`PLAN_PRICES`) is the catalog:

```typescript
export const PLAN_MODULES: Record<string, PlatformModule[]> = {
  starter: ["CRM"],
  professional: ["CRM", "AUTOMATIONS"],
  enterprise: ["CRM", "AUTOMATIONS", "AI_WHATSAPP"],
};
```

It's reference data, shown wherever a plan is discussed — the admin's `ChangePlanDialog` ("Incluye:
CRM, Automatizaciones" per tier), the client's own `/portal/settings` plan card ("Tu plan incluye:
..."), and `OrganizationModulesPanel`'s header plus a per-row "Incluido en el plan" badge — so an
admin or client can always see what a plan is supposed to include without it silently reshaping what
the org actually has.

`syncModulesToPlan()` (`src/actions/admin/modules.ts`) is the one explicit, admin-triggered action
that acts on the catalog — and it's additive only:

```typescript
const planModules = PLAN_MODULES[org.plan] ?? PLAN_MODULES.starter;
const activeSet = new Set(existing.filter((m) => m.status === "ACTIVE").map((m) => m.module));
const toActivate = planModules.filter((m) => !activeSet.has(m)); // never computes anything to suspend
```

It only ever activates a module the plan includes that isn't already `ACTIVE` (source set to
`SUBSCRIBED`), and never suspends or cancels anything — a module an org has beyond its plan (an
`ADMIN_GRANTED` courtesy grant, or one left over from a downgrade) is left exactly as it is. The
"Sincronizar con plan" button in `OrganizationModulesPanel` only renders when there's actually
something to activate. Verified live: suspended `CRM` for a real org on Starter, confirmed the button
appeared and the reference copy/badges rendered correctly, clicked it, and confirmed `CRM` came back
`ACTIVE`/`SUBSCRIBED` — i.e. exactly its pre-test state, so no cleanup was needed.

---

### 12. SmartCard: a Shared-Database Bridge Instead of a Webhook (Fase 14)

Every other external integration in this document (§7, §8) follows the n8n-invisibility pattern:
HMAC-signed HTTP, this app owns its own data. SmartCard (`PlatformModule.NFC_QR`) doesn't, on
purpose — `reymen-smartcard` is a separate, already-built product (its own repo, Supabase Auth
instead of this app's NextAuth) rather than something worth rebuilding here. Two different
integration shapes exist side by side:

- **Read**: `getSmartcardCompanyIdForOrg()` / `getCompanyCardStats()` (`src/lib/smartcard-company.ts`)
  query `reymen-smartcard`'s Supabase tables **directly**, using `SUPABASE_URL`/
  `SUPABASE_SERVICE_ROLE_KEY` pointed at *that repo's* project (§13) — not a call to an API this app
  controls. The query logic itself is ported/duplicated from that repo's own entitlements package
  (not published, can't be imported), adapted for two differences noted in the file's own comments.
  Used by the Food dashboard's "SmartCard Restaurante" widget and the portal's own SmartCard stats.
- **Sign-in hand-off**: clicking "SmartCard" in the portal doesn't proxy or embed anything — it mints
  a short-lived (60s), HMAC-signed token (`createSmartcardSsoToken()`, `src/lib/smartcard-sso.ts`)
  and redirects to `reymen-smartcard`'s own `/api/sso/smartcard`, which verifies it with the
  **same** `SMARTCARD_SSO_SECRET` (ported/duplicated verification function, not a shared package)
  and signs the user in there via a Supabase Admin API magic link. No second password, no second
  signup. `c1b9408` later brought a native panel into `/portal/smartcard` for stats that don't need
  the hand-off; the SSO redirect still exists for anything that needs the actual other app's UI.
- Inviting a SmartCard team member originally reused Supabase Auth's own invite flow, which turned
  out to be broken at the source; it was replaced with the portal's native team-invite flow instead,
  and a bug where a failed invite crashed instead of surfacing a normal error was fixed by making the
  invite path return a result object rather than throwing.

---

### 13. Food Ops: a Second Vertical Built the Same Way as CRM (Fase 15)

`FOOD_OPS` (restaurant operations) followed the exact same discipline as every module before it —
real models behind `requireModule`/`assertModuleEnabled` (item 7), nothing invented — built in the
same order Fase 1 established: schema → module assignable from admin → Server Actions → portal
pages → i18n → nav entry. See §4 "Food Ops" for the full model set. Two things worth calling out
that aren't obvious from the schema alone:

- The dashboard (`food/page.tsx`) genuinely mixes real and demo data in the same screen, and is
  explicit about which is which rather than papering over the gap — `DemoBadge` marks the two blocks
  (`DEMO_TOP_DISHES`, `DEMO_RECENT_PURCHASES`) that don't have a backing model, right next to KPI
  cards and an hourly-sales chart built from real `FoodSale` rows. Once `FoodDishSale` (§4) has
  enough real history for a given org, "Platillos más vendidos" could be swapped to it — not done
  yet, out of scope for the phase that introduced per-dish sales tracking.
- `MODULE_LABEL_EN` (the English half of `MODULE_LABEL`, §1) is duplicated by necessity — two
  literal object dictionaries, no shared derivation — and `FOOD_OPS` was initially added to only one
  of them, so the module rendered its Spanish name even with the language toggle set to English.
  Worth remembering next time a module is added: update both copies, or the gap won't surface until
  someone actually switches languages.

---

### 14. Dish → Variant Refactor: One Menu Item, Many Sellable Presentations (Fase 16)

The first cut of Food's costing feature (Fase 15) gave every dish exactly one price — accurate for
most of the menu, wrong for anything sold in sizes. The initial workaround was creating separate
dishes per size ("Berry Bloom (Chico)", "Berry Bloom (Grande)"), which worked but polluted the menu
list and made "how many Berry Blooms sold today" impossible to answer without adding the two rows
back together by hand. §4's `FoodDish`/`FoodDishVariant` split replaced that: one dish, N variants,
each with its own price **and its own recipe** — a large smoothie isn't the small one's cost scaled
by a multiplier, it's a separately-measured ingredient list, so the split had to go all the way down
to `FoodDishVariantIngredient` and `FoodDishSale.variantId`, not stop at price.

This was a live-data migration, not a greenfield model: the first real client profile created under
the old one-price-per-dish design (35 dishes, no recipes/sales captured yet) had to be reshaped
without loss. Because the affected tables were still empty of ingredient/sale rows for that org, the
migration added the new columns/tables, and a one-off script re-seeded the same 35 items as proper
dish+variant pairs (merging the "(Chico)"/"(Grande)" name-suffix workaround back into one dish per
product) — verified by re-diffing name/price before and after, not just trusting the script ran.

---

### 15. Admin User Management, Theme Persistence, and a Platform Polish Batch

A batch of small, independently-reported fixes landed together rather than as separate phases —
worth documenting as a batch since none of them individually justified a "Fase N," but together they
touch RBAC, session state, and UI consistency in ways future changes should be aware of:

- **Admin-driven user management** (`admin/users.ts`, §10): admins can now add/edit/deactivate users
  scoped to a specific client org, *and* create standalone admin users with no `organizationId` at
  all — previously the only way to create a user was the client-signup flow, which assumed every
  user belongs to exactly one client organization.
- **Theme/language persistence across login**: `src/app/layout.tsx` builds its own lightweight
  `NextAuth(authConfig)` instance (mirroring `proxy.ts`'s edge-safe pattern) to read
  `session.user.theme`/`language` as the *primary* source for the initial render, falling back to
  the `reymen-theme`/`reymen-lang` cookies only when there's no session — previously a user's
  dark-mode/English preference reset to the cookie default on every fresh login.
- **Notification bell unread count**: `User.notificationsSeenAt` now tracks when the bell was last
  opened; `GET /api/notifications` computes `unreadCount` as items newer than that timestamp (the
  list itself still shows everything pending), and opening the bell POSTs to clear it.
- **Clients list rows are fully clickable** (not just a "Ver detalle" link inside each row) — a
  small interaction fix, listed here because it's the kind of thing that's easy to silently regress
  when a row's internal layout changes later.
- **Full i18n audit** (`0a9a286`) removed hardcoded Spanish strings platform-wide in favor of
  `t.xxx` lookups, and a follow-up pass fixed specific dark-mode combinations (`bg-brand-50` info
  boxes rendering near-illegible text) that only showed up once every string was actually running
  through the theme-aware components.
- **Mobile responsiveness pass** (`2411b0a`) on the portal/admin shell and highest-traffic pages —
  the recurring root cause, worth remembering for new pages, was a `min-w-0` missing on a flex child
  next to an unshrinkable element (an `<input>`, a stat number), which silently forces the whole row
  to overflow instead of wrapping.

---

### 16. Next.js 16 Upgrade and a Security Patch Batch

Upgraded `next` 15 → 16 specifically to pick up a patched `postcss` (an XSS/path-traversal advisory
in the transitive dependency tree), plus a separate pass patching other flagged transitive
dependencies. Two things broke as a direct result and are worth knowing if a future upgrade hits
similar symptoms:

- Next 16 renamed the middleware convention file; `middleware.ts` became `src/proxy.ts` (and its
  test file followed: `proxy.test.ts`). The `/api/auth` matcher-exclusion fix (the guard that keeps
  Auth.js's own routes from being caught by the app's auth-gate matcher) had to be re-verified after
  the rename — a regression here previously caused login to fail with a 502 in production, so this
  is a change worth double-checking on any future middleware/proxy edit, not just at upgrade time.
- `next start` doesn't work with `output: standalone` (§14/§15 deployment) starting with this
  version's stricter enforcement — the standalone server must be run directly
  (`node .next/standalone/server.js`), with `.next/static` and `public/` manually copied into the
  standalone output first (they aren't included automatically). Scripts or docs that still say
  `next start` for a standalone build need updating.

---

### 17. Categories, Modifiers, and a POS Sales Webhook (Fase 17)

A restaurant partner building a separate POS app (a different, standalone repo — not part of this
codebase) asked for three things from the Reymen side so its menu screen and checkout flow had
somewhere to read from and post to: menu categories, modifier groups (size of ice, extras,
término de cocción...), and a webhook to log completed orders. All three landed together because
they share one consumer (§4 "POS integration").

- **Categories and modifiers are new top-level entities, not fields bolted onto `FoodDish`.**
  `FoodDishCategory` is a simple named grouping; `FoodModifierGroup`/`FoodModifierOption` model
  the "pick N of these options, optionally with an extra charge" shape a POS checkout screen needs.
  Modifiers attach to the **dish**, not the variant (§4) — a modifier like "sin cebolla" doesn't
  care which size was ordered.
- **Hard delete instead of the soft-disable pattern the rest of Food uses** (§4) — the deciding
  factor was data dependency, not consistency for its own sake: `FoodDish`/`FoodOperatingCost`
  have sales/analytics history rows that would orphan on a hard delete; categories and modifier
  groups don't, so `onDelete: SetNull`/`Cascade` on the relations is enough.
- **`GET /api/v1/food/menu` (§9) grew, `POST /api/webhooks/pos/orders` (§7) is brand new.** The
  menu endpoint now embeds each dish's category and modifier groups so a single request gives a
  POS everything it needs to render a checkout screen. The webhook reuses the n8n webhooks'
  entire reliability stack (§8's `isWebhookAuthorized`/`checkRateLimit`/`ingestWebhookEvent`)
  under its own `source: "pos"` — proof that stack was never actually n8n-specific, just used
  exclusively by n8n until now.
- **`processFoodPosOrder()` accumulates, `logFoodDishSales()` replaces — same table, different
  callers, deliberately different semantics** (§4, §7). This is the one place in the module where
  two write paths touch the same unique constraint with opposite behavior; it's called out
  directly in the Prisma schema comment on `FoodDishSale`, not just here, so a future reader
  hitting one code path in isolation still finds the reasoning.
- **Reference implementation, not the finished integration:** this phase builds the Reymen-side
  surface only. The actual POS application is a separate codebase; verifying the full request
  lifecycle (POS UI → this webhook → `FoodDishSale`/`FoodSale`) happens once that project can
  make real HTTP calls against a deployed instance, not from this repo's test suite.

**Fase 17b — refinements requested once the POS side actually integrated (§4, §7, §9):**
building against the real contract surfaced gaps a spec review alone wouldn't have: `netAmount`'s
exact definition (without IVA, never "minus discounts") needed to be stated explicitly rather than
left to a plausible-looking example that turned out inconsistent with any real tax rate; order
cancellations needed *some* mechanism, resolved as negative quantities on the same webhook rather
than a second endpoint; a POS **device** needed a way to read the menu without holding the secret
that can also sign orders, hence `Organization.foodPosReadKey` as a second, narrower-scoped key;
the naive `max(updatedAt)` approach originally floated for `ETag`/`304` caching turned out to miss
deletions of a row that isn't the most-recently-modified one, so `GET /api/v1/food/menu` hashes
the actual response content instead — exact by construction; and modifier option sales
(`FoodModifierOptionSale`) needed their own table specifically *because* `FoodModifierOption` is
hard-deleted (§4) — the one case in this phase where "just add a foreign key" would have silently
undone the soft-disable design decision two paragraphs up. The pattern across all five: a
production integration finds edge cases a written spec doesn't, and each one got resolved by
extending the existing design rather than bolting on a special case.

**Fase 17c — one more, caught the same way:** the POS side noticed their own retry logic for a
rejected order stripped out *all* modifiers, including valid ones, because there was no way to
tell which `optionId` had been rejected. The actual fix belonged on the Reymen side: an
unrecognized `modifiers[].optionId` (stale POS cache after an admin edits the modifier catalog) now
gets silently dropped instead of failing the whole order (§7) — `variantId` stays strict, since
that's the real product and money. The general lesson repeats: don't make the caller work around
a validation choice when relaxing that one specific check is both safe and simpler for everyone.

---

## 18. Extending the Platform

### How to Add a New Webhook Route

To add a new inbound webhook (e.g., `/api/webhooks/n8n/appointments`):

1. **Create the route file:**
   ```
   src/app/api/webhooks/n8n/appointments/route.ts
   ```

2. **Use the standard reliability pattern:**
   ```typescript
   import { NextRequest, NextResponse } from "next/server";
   import { prisma } from "@/lib/prisma";
   import { verifyWebhookSignature } from "@/lib/webhook-validator";

   const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET ?? "";

   export async function POST(req: NextRequest) {
     const signature = req.headers.get("x-reymen-signature") ?? "";
     const orgId = req.headers.get("x-reymen-orgid") ?? "";
     const rawBody = await req.text();

     // 1. Verify HMAC
     if (!verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)) {
       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
     }

     // 2. Store event (reliability pattern)
     const webhookEvent = await prisma.webhookEvent.create({
       data: {
         organizationId: orgId,
         source: "n8n",
         eventType: "appointment.created", // new event type
         payload: JSON.parse(rawBody),
         status: "PROCESSING",
       },
     });

     try {
       // 3. Parse and validate
       const payload = JSON.parse(rawBody) as { /* your fields */ };

       // 4. Business logic
       await prisma.appointment.create({ data: { organizationId: orgId, ... } });

       // 5. Mark as processed
       await prisma.webhookEvent.update({
         where: { id: webhookEvent.id },
         data: { status: "PROCESSED", processedAt: new Date() },
       });

       return NextResponse.json({ success: true });
     } catch (error) {
       await prisma.webhookEvent.update({
         where: { id: webhookEvent.id },
         data: { status: "FAILED", errorMessage: error?.message },
       });
       return NextResponse.json({ error: "Processing failed" }, { status: 500 });
     }
   }
   ```

3. **Document the route** in `src/app/(admin)/admin/api-docs/page.tsx`.
4. **Configure n8n** to call the new endpoint with the HMAC signature.

No middleware changes are needed — webhook routes are automatically public (matched by `pathname.startsWith("/api/webhooks")`).

---

### How to Add a New Portal Page

1. **Create the page file** following the route group convention:
   ```
   src/app/(portal)/portal/my-feature/page.tsx
   ```

2. **Make it a Server Component** (no `"use client"`). Fetch data server-side:
   ```typescript
   import { auth } from "@/lib/auth";
   import { redirect } from "next/navigation";
   import { prisma } from "@/lib/prisma";

   export default async function MyFeaturePage() {
     const session = await auth();
     if (!session?.user.organizationId) redirect("/login");

     const data = await prisma.myModel.findMany({
       where: { organizationId: session.user.organizationId },
     });

     return (
       <div>
         {/* Render your data */}
       </div>
     );
   }
   ```

3. **Add the navigation link** to `src/components/portal/PortalSidebar.tsx`.

4. **Check permissions** if the page should be restricted by role:
   ```typescript
   import { can } from "@/lib/permissions";
   if (!can(session.user.role, "my_permission")) redirect("/portal/dashboard");
   ```

5. **Create Server Actions** in `src/actions/my-feature.ts` for any mutations. Follow the existing pattern: auth check → org scope → Prisma mutation → revalidatePath → return result.

6. **Add Client Components** (with `"use client"`) only for interactive parts (forms, dialogs, toggles). Import and use them inside your Server Component.

---

### How to Add a New Permission

1. **Add the action to the `Action` type** in `src/lib/permissions.ts`:
   ```typescript
   type Action =
     | "leads:create"
     | ... (existing)
     | "my_feature:manage"  // new
     | "my_feature:view";   // new
   ```

2. **Add the action to each role's permission array**:
   ```typescript
   const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
     SUPER_ADMIN: [ ...existing, "my_feature:manage", "my_feature:view" ],
     ADMIN:       [ ...existing, "my_feature:manage", "my_feature:view" ],
     OWNER:       [ ...existing, "my_feature:manage", "my_feature:view" ],
     MANAGER:     [ ...existing, "my_feature:view" ],
     AGENT:       [ ...existing ],
     VIEWER:      [ ...existing ],
     CLIENT:      [ ...existing ],
   };
   ```

3. **Use the permission in your Server Action:**
   ```typescript
   import { can } from "@/lib/permissions";
   import type { UserRole } from "@prisma/client";

   export async function myFeatureAction() {
     const session = await auth();
     if (!can(session.user.role as UserRole, "my_feature:manage")) {
       throw new Error("Sin permisos");
     }
     // ... action logic
   }
   ```

4. **Conditionally render UI** based on permission (use session role in Server Components):
   ```typescript
   const canManage = can(session.user.role, "my_feature:manage");
   // { canManage && <MyButton /> }
   ```

No database migration is needed — permissions are fully code-defined.

---

*End of Technical Documentation — ReymenApp v1.0*

*For questions: engineering@reymen.io*
