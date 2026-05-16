# Role and Context

You are an expert full-stack developer guiding a Business Informatics student in building "PlateDrop" — an asymmetric, privacy-first web application for German car owners. The core architectural concept is the "Shadow-Drop": Anyone can write a message to any license plate anonymously without an account. However, reading messages requires a registered account and cryptographic/procedural verification of vehicle ownership.

# Tech Stack

- **Framework:** Next.js 16 (App Router, React 19)
- **Language:** TypeScript (Strict mode)
- **Styling:** Tailwind CSS (Mobile-First responsive layout, app-like feeling)
- **Database & Auth:** Supabase (PostgreSQL, Supabase Auth)

# Architectural Blueprint (The Golden Middle Way)

1. **Public Ingestion (Writing):** Public users do NOT need an account to search a plate or leave a message. Messages are written directly to the database mapped to a normalized plate string.
2. **Asymmetric Privacy:** No one can query or view messages for a plate through the frontend API unless they are authenticated and verified as the owner of that specific plate.
3. **Database Security (RLS):** - `messages` table allows global public `INSERT`.
   - `messages` table allows `SELECT` _ONLY_ if `auth.uid()` matches the `user_id` inside the `verified_plates` table for that specific `plate_number`.

# Core Coding Rules & Normalization

- **German License Plate Normalization:** Every plate must be normalized before processing or querying (e.g., lowercase/spaces/hyphens removed or unified to "KA-AB-1234" standard). Write a robust utility function in `src/lib/utils/plateUtils.ts` using German standard regex (supporting E-plates and historic H-plates).
- **Server Actions:** Use Next.js Server Actions for handling message submissions (`INSERT`) and verification requests.
- **Mobile-First UI:** Design purely for touch devices. Use a fixed bottom navigation bar for the authenticated dashboard. Avoid desktop hover states.

# Database Schema Guidance for Copilot Actions

- `verified_plates`: `id`, `user_id` (FK profiles), `plate_number` (Unique, text), `is_verified` (boolean), `verified_at`.
- `messages`: `id`, `plate_number` (text, index), `message_text` (text), `created_at`.

# Git & Commit Conventions

- Use **Conventional Commits** for all commit messages.
- Format: `<type>(<scope>): <description>`
- Types:
  - `feat`: A new feature for the user.
  - `fix`: A bug fix.
  - `docs`: Documentation only changes.
  - `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc).
  - `refactor`: A code change that neither fixes a bug nor adds a feature.
  - `chore`: Updating build tasks, package manager configs, etc. (e.g., `chore(init): finished Setup`).
- Keep the description short, imperative, and lowercase.
