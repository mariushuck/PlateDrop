# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
pnpm dev           # Start development server
pnpm build         # Production build
pnpm lint          # Run Biome linter
pnpm check         # Run Biome linter + formatter check
pnpm format        # Auto-format with Biome
pnpm test          # Run Jest tests
pnpm test:watch    # Jest in watch mode
```

To run a single test file: `pnpm exec jest __tests__/utils/plateUtils.test.ts`

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
- `profiles` — linked to `auth.users`; has `is_admin boolean` for admin access; auto-created via DB trigger on signup (no manual insert needed)
- `verified_plates` — `user_id`, `plate_number` (unique), `is_verified`, `verification_status` (`pending`/`approved`/`rejected`), `verification_code` (generated 6-char code shown to user), `proof_image_url`
- `messages` — `plate_number`, `message_text`, `created_at`
- Generated types: `src/types/database.types.ts`

**Plate verification flow**: User claims plate → system generates verification code (format `XX-XXXX`) → user writes code on paper, places behind windshield, photos it → user uploads photo to Supabase Storage bucket `proofs` → admin reviews photo in `/admin` and approves/rejects. Only `is_verified = true` plates unlock message reading.

**Admin authorization**: `/admin` routes check `profiles.is_admin` at the Server Action level. No middleware-level guard exists — admin checks are done inline in each admin Server Action.

**German plate normalization**: All plates go through `src/lib/utils/plateUtils.ts` before any DB query or insert. Supports standard, E-plate, and H-plate formats.

**Forms** use React 19's `useActionState` hook wired to Server Actions. The `dashboard/page.tsx` is a Client Component that fetches data client-side after an auth check (redirects to `/login` if unauthenticated).

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
