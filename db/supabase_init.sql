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
-- 4) AUTO-CREATE PROFILE ON SIGNUP (TRIGGER)
-- ==========================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_admin)
  VALUES (new.id, new.email, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ==========================================
-- 5) STORAGE BUCKET
-- ==========================================
-- Create the proofs bucket (public — URLs in admin page are loaded directly)
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', true)
ON CONFLICT (id) DO NOTHING;


-- ==========================================
-- 6) GRANTS
-- ==========================================
GRANT INSERT ON messages TO anon, authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON verified_plates TO authenticated;
