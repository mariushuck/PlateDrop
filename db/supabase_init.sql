-- Supabase initialization SQL for PlateDrop MVP
-- Run this in Supabase SQL editor

-- Enable UUID generation (pgcrypto) if not already available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1) PROFILES TABLE & POLICIES
-- ==========================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

-- Owners can select/insert/update their profile
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  USING (auth.uid()::uuid = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid()::uuid = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (auth.uid()::uuid = id)
  WITH CHECK (auth.uid()::uuid = id);


-- ==========================================
-- 2) VERIFIED PLATES TABLE & POLICIES
-- ==========================================
CREATE TABLE IF NOT EXISTS verified_plates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plate_number text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT verified_plates_plate_unique UNIQUE (plate_number)
);

CREATE INDEX IF NOT EXISTS idx_verified_plates_plate ON verified_plates (plate_number);

ALTER TABLE IF EXISTS verified_plates ENABLE ROW LEVEL SECURITY;

-- Users can manage their own records
DROP POLICY IF EXISTS "verified_plates_select_own" ON verified_plates;
CREATE POLICY "verified_plates_select_own" ON verified_plates
  FOR SELECT
  USING (auth.uid()::uuid = user_id AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "verified_plates_insert_own" ON verified_plates;
CREATE POLICY "verified_plates_insert_own" ON verified_plates
  FOR INSERT
  WITH CHECK (auth.uid()::uuid = user_id AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "verified_plates_update_own" ON verified_plates;
CREATE POLICY "verified_plates_update_own" ON verified_plates
  FOR UPDATE
  USING (auth.uid()::uuid = user_id AND auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid()::uuid = user_id AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "verified_plates_delete_own" ON verified_plates;
CREATE POLICY "verified_plates_delete_own" ON verified_plates
  FOR DELETE
  USING (auth.uid()::uuid = user_id AND auth.uid() IS NOT NULL);


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

-- Allow anyone (including anonymous) to INSERT messages
DROP POLICY IF EXISTS "messages_allow_public_insert" ON messages;
CREATE POLICY "messages_allow_public_insert" ON messages
  FOR INSERT
  WITH CHECK (true);

-- Allow SELECT only if the requesting user has a verified plate matching the message's plate_number
DROP POLICY IF EXISTS "messages_select_if_verified_owner" ON messages;
CREATE POLICY "messages_select_if_verified_owner" ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM verified_plates vp
      WHERE vp.user_id = auth.uid()::uuid
        AND vp.plate_number = messages.plate_number
        AND vp.is_verified = true
    )
  );

-- Deny update/delete for public — only owners or service role should manage messages
DROP POLICY IF EXISTS "messages_no_update_delete_public" ON messages;
CREATE POLICY "messages_no_update_delete_public" ON messages
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "messages_no_delete_public" ON messages;
CREATE POLICY "messages_no_delete_public" ON messages
  FOR DELETE
  USING (false);


-- ==========================================
-- 4) GRANTS
-- ==========================================
GRANT INSERT ON messages TO anon, authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON verified_plates TO authenticated;