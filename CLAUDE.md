# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Further documentation

- `docs/architecture.md` — system layout, data model, every RLS policy in prose, sequence diagrams, test strategy
- `docs/admin.md` — operator runbook: granting admin rights, approvals, backup and restore, updates, troubleshooting, GDPR deletion, scheduled maintenance
- `AUDIT.md` — pre-go-live security/compliance audit (2026-08-30) with the remediation status of every finding; historical, do not rewrite
- `TODO.md` — prioritized list of what comes next

Keep them current when the behaviour they describe changes; the README deliberately stays short and links into them.

## Commands

```bash
pnpm dev              # Start development server
pnpm build            # Production build
pnpm lint             # Run Biome linter
pnpm check            # Run Biome linter + formatter check
pnpm format           # Auto-format with Biome
pnpm typecheck        # TypeScript, no emit
pnpm test             # Jest unit tests (no Docker needed)
pnpm test:watch       # Unit tests in watch mode
pnpm test:db:up       # Throwaway Postgres + Mailpit for integration tests
pnpm test:integration # Integration tests against real Postgres
pnpm test:db:down     # Tear the test containers down
pnpm smoke            # End-to-end HTTP test against a running `docker compose up`
pnpm db:migrate       # Apply db/migrations/*.sql
pnpm db:set-admin     # scripts/set-admin.mjs <email> [--revoke], needs DATABASE_ADMIN_URL
pnpm db:prune         # scripts/maintenance.mjs: prune sessions, throttle rows, old messages, orphaned proofs
```

Run a single test file: `pnpm exec jest __tests__/utils/plateUtils.test.ts`

Run the whole stack: `docker compose up -d` (app on :3000, Mailpit on :8025).

## What PlateDrop Is

**Shadow-Drop**: Anyone can anonymously send a message to any German license plate without an account. Only a registered, plate-verified owner can read messages sent to their plate. This asymmetric privacy model (public write, authenticated read) is the core design constraint — never break it.

## Architecture

**Stack**: Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · PostgreSQL 18 via `pg` · better-auth · nodemailer · Docker Compose

**Key path alias**: `@/*` → `src/*`

**Everything runs locally.** There is no managed backend. The app talks to its own Postgres over a `pg` pool, better-auth stores users and sessions in that same database, proof photos live in a Docker volume, and mail goes out over SMTP (Mailpit in development).

### Database access

- `src/lib/db/pool.ts` — the `pg` pool (one per process, survives dev hot-reload)
- `src/lib/db/context.ts` — `withUser(userId, fn)` / `withAnon(fn)`: opens a transaction and sets the requesting user as a **transaction-local** session variable
- `src/lib/db/queries.ts` — **every** SQL statement in the application. Never query the database from anywhere else.
- `src/lib/db/types.ts` — hand-written row types matching `db/migrations/0003_app_tables.sql`

Client Components cannot reach the database. Pages that need data are Server Components; interactive parts are small Client Components underneath them.

### Authorization — two independent layers, keep both

1. **Row Level Security.** The app connects as `platedrop_app`: not an owner, no `BYPASSRLS`, minimal grants — so the policies genuinely apply. Policies read the current user via `app.current_user_id()`, which returns the transaction-local `app.user_id` set by `withUser()`. Transaction-local matters: the value dies with COMMIT/ROLLBACK and cannot leak to the next request that reuses the pooled connection.
2. **Application layer.** Every function in `queries.ts` also filters explicitly by `user_id`; the admin queries (`listPendingVerifications`, `setPlateVerification`, `canReadProof`) add `app.is_admin()` to their SQL instead. Admin Server Actions check the session's `isAdmin` before touching the database.

A vulnerability requires both layers to fail. When adding a query, add both.

The RLS invariants are covered by `__tests__/integration/rls.test.ts`. Changing `db/migrations/0004_policies.sql` without running that suite is not acceptable.

### Auth

- `src/lib/auth/server.ts` — better-auth instance (email/password, required email verification, password reset, email change, account deletion). A password reset revokes every session (`revokeSessionsOnPasswordReset`). `disabledPaths` blocks `/delete-user` over HTTP — better-auth would delete there without a password on a fresh session; deletion only goes through the `deleteAccount` Server Action, which passes the password to `auth.api.deleteUser`. Cookies are hardened explicitly: `useSecureCookies` when `BETTER_AUTH_URL` is https, `sameSite: "lax"` (not strict — mail links are cross-site top-level navigations), `trustedOrigins` pinned to the base URL.
- `src/lib/auth/session.ts` — `getSessionUser()`, `requireUser()`, `requireAdmin()`
- `src/lib/auth/client.ts` — client for Client Components
- `src/lib/auth/passwordPolicy.ts` — `MIN_PASSWORD_LENGTH` (12), the single source for better-auth, Server Actions and form hints
- `src/app/api/auth/[...all]/route.ts` — better-auth endpoints; the links in verification and reset mails point here

`is_admin` is a column on the better-auth `users` table, declared `input: false` — no request payload can set it. Migration `0007` additionally withholds `UPDATE (is_admin)` from `platedrop_app`. There is no `profiles` table. Admin rights are granted only via `scripts/set-admin.mjs` with owner credentials.

**Self-service GDPR** (`/dashboard/settings`): `exportMyData` returns a JSON export (`exportUserData` in `queries.ts`); `deleteAccount` calls better-auth `deleteUser` with password confirmation. The `beforeDelete` hook removes the user's proof directory (`deleteAllProofsForUser`), the FK cascade removes sessions, accounts and plates. Messages stay — they carry no link to an account.

### Database schema

Defined as numbered SQL files in `db/migrations/`, applied by `scripts/migrate.mjs` (tracked in `schema_migrations`, each file in its own transaction). Never edit an already-applied file — add a new one.

- `0001` roles and `app.current_user_id()`
- `0002` better-auth tables (`users`, `sessions`, `accounts`, `verifications`) — generated by `scripts/generate-auth-schema.mjs`, regenerate on a better-auth upgrade. Deliberately without RLS: better-auth must create users and sessions before any user context exists.
- `0003` `verified_plates`, `messages`, `message_throttle`
- `0004` RLS policies and grants — the security model
- `0005` both rate limits
- `0006` `UNIQUE (verification_code)` on `verified_plates`
- `0007` column-scoped `UPDATE` grant on `users` — `platedrop_app` cannot write `is_admin`
- `0008` canonical plate format: converts unambiguous legacy rows, revokes verification of ambiguous ones, adds the format `CHECK`
- `0009` read window: `app.message_read_since()` and the rewritten `messages_select_if_verified_owner` policy

### Storage

Proof photos go to `PROOFS_DIR` under `<userId>/<plateId>-<timestamp>.<ext>`, handled by `src/lib/storage/proofs.ts`. The path is validated against a strict pattern before any filesystem access. The extension comes from the file's magic bytes (`sniffImageType`: JPEG, PNG, WebP, HEIC) — never from the submitted filename or the client-supplied content type. `uploadProof` checks plate ownership (`plateBelongsToUser`) **before** writing anything, and removes the replaced photo after a successful update.

**Plate verification flow**: User claims plate → system generates verification code (format `XX-XXXX`, `src/lib/utils/verificationCode.ts`: `crypto.randomInt`, alphabet without 0/O/1/I, retried on a unique-constraint collision) → user writes code on paper, places behind windshield, photos it → user uploads photo → admin reviews it in `/admin` and approves/rejects. A rejected plate can be resubmitted; a new photo puts it back to `pending`. Only `is_verified = true` plates unlock message reading.

### Mutations and routes

**Server Actions are the exclusive mechanism for mutations** (message submission, plate claims, admin approvals, all auth forms). Do not add API routes for writes.

Exactly three route handlers exist, and all are deliberate exceptions:

- `src/app/api/auth/[...all]/route.ts` — required by better-auth; the links in its e-mails have to hit a URL.
- `src/app/api/proofs/[...path]/route.ts` — **GET only, mutates nothing**. An `<img>` tag needs a URL, not a Server Action. It re-checks session and authorization on every single request, which replaced Supabase's pre-issued signed URLs: access ends the moment a plate is rejected or deleted, rather than when a signature expires.
- `src/app/api/health/route.ts` — **GET only, mutates nothing**. A container healthcheck / uptime monitor needs a URL. Runs `SELECT 1`, returns 200/503.

**German plate normalization**: All plates go through `parsePlate` in `src/lib/utils/plateUtils.ts` before any DB query or insert. The stored form keeps separators — `DISTRICT-LETTERS-NUMBER[E|H]`, e.g. `KA-AB-1234` — because without the district/letters boundary `K-AB 1234` (Köln) and `KA-B 1234` (Karlsruhe) collapse into one value and the verified owner of one would read the other's messages. Input without that boundary (`KAAB1234`) is rejected as `ambiguous` unless only one split is valid (`BM123` → `B-M-123`). Districts may contain umlauts; the number has no leading zero. Migration `0008` enforces the same pattern as a `CHECK` on `verified_plates` and `messages` (`NOT VALID`: pre-0008 compact rows stay, see `docs/admin.md` A3). Write and read paths must use it identically or the join in `listMessagesForUser` stops matching.

**Read window**: an owner reads messages from 30 days before their claim (`verified_plates.created_at`) onwards, never older ones — plates get reassigned. The boundary lives in one SQL function, `app.message_read_since()` (migration `0009`), used by the `messages` SELECT policy and by `listMessagesForUser` / `exportUserData`.

**Rate limiting**: per sender via a salted, daily-rotating SHA-256 hash of the IP (`check_message_rate`, 10/minute) and per plate via a DB trigger (`enforce_message_rate_limit`, 20/hour). The raw IP is never stored. The client IP is read from `X-Forwarded-For` at position `length - TRUSTED_PROXY_HOPS` (default 1 = the Caddy proxy), never the client-controlled first entry; `TRUSTED_PROXY_HOPS=0` disables header trust.

**Forms** use React 19's `useActionState` wired to Server Actions.

### Configuration, logging, headers

- `src/lib/env.ts` — `requireEnv(name)`: fail fast on a missing or empty variable. Use it for anything a security or privacy guarantee depends on (`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `RATE_LIMIT_SALT`) — never fall back to `""`.
- `src/lib/logger.ts` — `logger.info/warn/error`; JSON lines in production, readable in dev. Use it instead of `console.*` so error aggregation can be attached in one place.
- `next.config.ts` — app-wide security headers (CSP without nonce, so `'unsafe-inline'` remains for scripts/styles; `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production). `Caddyfile` sets HSTS at the edge as well.

## Docker

- `docker-compose.yml` — base: `db`, one-shot `migrate`, `web`, optional `proxy` (profile `proxy`)
- `docker-compose.override.yml` — development, loaded automatically: hot reload plus Mailpit
- `docker-compose.prod.yml` — production: standalone build, database not exposed, plus the one-shot `backup` service (profile `backup`, runs `scripts/backup.sh`)
- `docker-compose.test.yml` — throwaway Postgres and Mailpit for the integration tests

`web` and `migrate` share one image (the `runner` stage); the standalone output already contains `pg`. The maintenance scripts (`scripts/prune-*.mjs`, `maintenance.mjs`, `set-admin.mjs`) run through `docker compose run --rm migrate node scripts/…`. `web` has a healthcheck against `/api/health`.

Note: since `postgres:18` the data volume mounts at `/var/lib/postgresql`, not `/var/lib/postgresql/data`.

## Testing

New behavior is written test-first. For anything touching authorization, verify the test actually catches a regression by temporarily breaking the policy or check and watching it fail — several tests in this repo were only made meaningful that way.

Integration tests need `pnpm test:db:up` first. They run serially against one database and reset it between tests.

CI (`.github/workflows/ci.yml`, on push to `main`/`dev` and on PRs) runs `pnpm check`, `typecheck`, `test`, `build`, the integration suite against service containers, `pnpm audit --audit-level high`, and a gitleaks secret scan. Dependabot (`.github/dependabot.yml`) opens weekly update PRs.

## UI Rules

- **Mobile-first** — design for touch, not desktop. No hover-only states.
- Fixed bottom nav bar for the authenticated dashboard.
- Icons from `lucide-react`, toasts via `sonner`.

## Commit Convention

`<type>(<scope>): <description>` — types: `feat`, `fix`, `docs`, `style`, `refactor`, `chore`. Description lowercase and imperative.

## Environment Variables

See `.env.example` for the full annotated list. Required: `DATABASE_URL`, `DATABASE_ADMIN_URL`, `POSTGRES_*`, `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_*`, `MAIL_FROM`, `PROOFS_DIR`, `RATE_LIMIT_SALT`, and `DOMAIN` for the proxy profile. Optional: `TRUSTED_PROXY_HOPS` (default 1), `MESSAGE_RETENTION_DAYS` (unset = keep messages), `THROTTLE_RETAIN_DAYS` (default 2), `BACKUP_RETENTION_DAYS` (default 14).
