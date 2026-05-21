# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # Start development server
npm run build      # Production build
npm run lint       # Run ESLint
npm run test       # Run Jest tests
npm run test:watch # Jest in watch mode
```

To run a single test file: `npx jest __tests__/utils/plateUtils.test.ts`

## What PlateDrop Is

**Shadow-Drop**: Anyone can anonymously send a message to any German license plate without an account. Only a registered, plate-verified owner can read messages sent to their plate. This asymmetric privacy model (public write, authenticated read) is the core design constraint — never break it.

## Architecture

**Stack**: Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres + Auth)

**Key path alias**: `@/*` → `src/*`

**Supabase clients**:
- `src/lib/supabase/client.ts` — browser client (for Client Components)
- `src/lib/supabase/server.ts` — server client (for Server Components and Actions)

**Server Actions** are the exclusive mechanism for mutations (message submission, plate claims, admin approvals). No API routes.

**Database security via RLS** (never bypass):
- `messages`: public `INSERT`; `SELECT` only if `auth.uid()` matches `user_id` on the requester's `verified_plates` row for that `plate_number`
- `verified_plates`: users manage only their own rows; admins can update `is_verified`
- `profiles`: users read/update only their own row

**Database schema** (defined in `db/supabase_init.sql`):
- `profiles` — linked to `auth.users`
- `verified_plates` — `user_id`, `plate_number` (unique), `is_verified`, `verified_at`
- `messages` — `plate_number`, `message_text`, `created_at`
- Generated types: `src/types/database.types.ts`

**German plate normalization**: All plates go through `src/lib/utils/plateUtils.ts` before any DB query or insert. Supports standard, E-plate, and H-plate formats.

## UI Rules

- **Mobile-first** — design for touch, not desktop. No hover-only states.
- Fixed bottom nav bar for the authenticated dashboard.
- Icons from `lucide-react`, toasts via `sonner`.

## Commit Convention

`<type>(<scope>): <description>` — types: `feat`, `fix`, `docs`, `style`, `refactor`, `chore`. Description lowercase and imperative.

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```
