-- Supabase initialization SQL for PlateDrop
-- Reflects the live schema as of 2026-05-31
-- Run this in Supabase SQL editor for fresh deployments

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ==========================================
-- 1) PROFILES TABLE & POLICIES
-- ==========================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now(),
  is_admin boolean DEFAULT false
);

ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ==========================================
-- 2) VERIFIED PLATES TABLE & POLICIES
-- ==========================================
CREATE TABLE IF NOT EXISTS verified_plates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plate_number text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  verification_status text DEFAULT 'pending',
  verification_code text,
  proof_image_url text,
  CONSTRAINT verified_plates_plate_unique UNIQUE (plate_number)
);

CREATE INDEX IF NOT EXISTS idx_verified_plates_plate ON verified_plates (plate_number);

ALTER TABLE IF EXISTS verified_plates ENABLE ROW LEVEL SECURITY;

-- Users can read their own plates
DROP POLICY IF EXISTS "verified_plates_select_own" ON verified_plates;
CREATE POLICY "verified_plates_select_own" ON verified_plates
  FOR SELECT
  USING (auth.uid() = user_id AND auth.uid() IS NOT NULL);

-- Admins can read all plates (for the approval dashboard)
DROP POLICY IF EXISTS "verified_plates_select_admin" ON verified_plates;
CREATE POLICY "verified_plates_select_admin" ON verified_plates
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Users can insert their own plates
DROP POLICY IF EXISTS "verified_plates_insert_own" ON verified_plates;
CREATE POLICY "verified_plates_insert_own" ON verified_plates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.uid() IS NOT NULL);

-- Users can only update proof_image_url — is_verified and verification_status stay locked
DROP POLICY IF EXISTS "verified_plates_update_proof_only" ON verified_plates;
CREATE POLICY "verified_plates_update_proof_only" ON verified_plates
  FOR UPDATE
  USING (auth.uid() = user_id AND auth.uid() IS NOT NULL)
  WITH CHECK (
    auth.uid() = user_id
    AND is_verified = false
    AND (verification_status = 'pending' OR verification_status = 'rejected')
  );

-- Admins can update any plate (approve/reject)
DROP POLICY IF EXISTS "verified_plates_update_admin" ON verified_plates;
CREATE POLICY "verified_plates_update_admin" ON verified_plates
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Users can delete their own plates
DROP POLICY IF EXISTS "verified_plates_delete_own" ON verified_plates;
CREATE POLICY "verified_plates_delete_own" ON verified_plates
  FOR DELETE
  USING (auth.uid() = user_id AND auth.uid() IS NOT NULL);


-- ==========================================
-- 3) MESSAGES TABLE & POLICIES
-- ==========================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text NOT NULL,
  message_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_plate ON messages (plate_number);

ALTER TABLE IF EXISTS messages ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can send messages
DROP POLICY IF EXISTS "messages_allow_public_insert" ON messages;
CREATE POLICY "messages_allow_public_insert" ON messages
  FOR INSERT
  WITH CHECK (true);

-- Only the verified plate owner can read their messages
DROP POLICY IF EXISTS "messages_select_if_verified_owner" ON messages;
CREATE POLICY "messages_select_if_verified_owner" ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM verified_plates vp
      WHERE vp.user_id = auth.uid()
        AND vp.plate_number = messages.plate_number
        AND vp.is_verified = true
    )
  );

DROP POLICY IF EXISTS "messages_no_update_delete_public" ON messages;
CREATE POLICY "messages_no_update_delete_public" ON messages
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "messages_no_delete_public" ON messages;
CREATE POLICY "messages_no_delete_public" ON messages
  FOR DELETE
  USING (false);


-- ==========================================
-- 3a) SPAM PROTECTION — PER-PLATE RATE LIMIT (TRIGGER, NO PII)
-- ==========================================
-- Caps how many messages a single plate can receive per hour. This is the
-- backstop against targeted flooding and is fully anonymous (no user/IP stored).
CREATE OR REPLACE FUNCTION enforce_message_rate_limit()
RETURNS trigger AS $$
DECLARE
  recent_count integer;
  max_per_hour constant integer := 20;
BEGIN
  SELECT count(*) INTO recent_count
  FROM messages
  WHERE plate_number = NEW.plate_number
    AND created_at > now() - interval '1 hour';

  IF recent_count >= max_per_hour THEN
    RAISE EXCEPTION 'message rate limit exceeded for plate'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_message_rate_limit ON messages;
CREATE TRIGGER trg_enforce_message_rate_limit
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION enforce_message_rate_limit();

-- Trigger functions fire regardless of EXECUTE grant — keep this off the RPC API.
REVOKE EXECUTE ON FUNCTION enforce_message_rate_limit() FROM PUBLIC, anon, authenticated;


-- ==========================================
-- 3b) SPAM PROTECTION — PER-IP RATE LIMIT (PSEUDONYMIZED)
-- ==========================================
-- The Server Action passes a salted SHA-256 hash of the client IP (never the raw
-- IP). The RPC atomically maintains a rolling window per hash and returns whether
-- the request is allowed.
CREATE TABLE IF NOT EXISTS message_throttle (
  ip_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE IF EXISTS message_throttle ENABLE ROW LEVEL SECURITY;
-- No policies + no grants: only the SECURITY DEFINER RPC below may touch this table.
REVOKE ALL ON TABLE message_throttle FROM anon, authenticated;

CREATE OR REPLACE FUNCTION check_message_rate(p_ip_hash text)
RETURNS boolean AS $$
DECLARE
  max_per_window constant integer := 10;        -- requests ...
  window_length constant interval := interval '1 minute'; -- ... per minute
  current_count integer;
  current_start timestamptz;
BEGIN
  IF p_ip_hash IS NULL OR length(p_ip_hash) = 0 THEN
    RETURN true; -- cannot identify caller; fall back to per-plate trigger
  END IF;

  INSERT INTO message_throttle (ip_hash, window_start, count)
  VALUES (p_ip_hash, now(), 0)
  ON CONFLICT (ip_hash) DO NOTHING;

  SELECT count, window_start INTO current_count, current_start
  FROM message_throttle
  WHERE ip_hash = p_ip_hash
  FOR UPDATE;

  IF current_start < now() - window_length THEN
    UPDATE message_throttle
      SET window_start = now(), count = 1
      WHERE ip_hash = p_ip_hash;
    RETURN true;
  END IF;

  IF current_count >= max_per_window THEN
    RETURN false;
  END IF;

  UPDATE message_throttle SET count = count + 1 WHERE ip_hash = p_ip_hash;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION check_message_rate(text) TO anon, authenticated;


-- ==========================================
-- 4) AUTO-CREATE PROFILE ON SIGNUP (TRIGGER)
-- ==========================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_admin)
  VALUES (new.id, new.email, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger-only function: not meant to be called as an RPC. Revoke the default
-- PUBLIC EXECUTE so anon/authenticated cannot invoke it via the Data API.
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ==========================================
-- 5) SYNC PROFILE EMAIL ON AUTH EMAIL CHANGE
-- ==========================================
CREATE OR REPLACE FUNCTION sync_user_email()
RETURNS trigger AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger-only function: not meant to be called as an RPC. Revoke the default
-- PUBLIC EXECUTE so anon/authenticated cannot invoke it via the Data API.
REVOKE EXECUTE ON FUNCTION sync_user_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION sync_user_email();


-- ==========================================
-- 6) STORAGE BUCKET (PRIVATE — accessed via signed URLs)
-- ==========================================
-- Proof photos show real plates and personal context, so the bucket is private.
-- Objects are keyed by "<user_id>/<...>" and read via short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Owners manage only objects under their own "<auth.uid()>/" prefix.
DROP POLICY IF EXISTS "proofs_owner_all" ON storage.objects;
CREATE POLICY "proofs_owner_all" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'proofs'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'proofs'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can read every proof (for the approval dashboard).
DROP POLICY IF EXISTS "proofs_admin_select" ON storage.objects;
CREATE POLICY "proofs_admin_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'proofs'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );


-- ==========================================
-- 7) GRANTS
-- ==========================================
GRANT INSERT ON messages TO anon, authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON verified_plates TO authenticated;
