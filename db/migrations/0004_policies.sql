-- ===========================================================================
-- 0004 – Row Level Security
-- ===========================================================================
-- Das Kernversprechen von PlateDrop: öffentlich schreiben, nur der verifizierte
-- Halter liest. Unter Supabase setzte PostgREST diese Policies durch. Ohne
-- PostgREST verbindet sich die App als `platedrop_app` – eine Rolle ohne
-- BYPASSRLS und ohne Ownership – und setzt pro Transaktion die Nutzer-ID als
-- lokale Session-Variable (src/lib/db/context.ts). Damit greifen dieselben
-- Regeln wie zuvor, nur gespeist aus app.current_user_id() statt auth.uid().

-- ---------------------------------------------------------------------------
-- Admin-Prüfung
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, damit die Policies das Admin-Flag lesen können, ohne der
-- App-Rolle dafür eigene Leserechte auf `users` zu geben.
CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = app.current_user_id() AND is_admin = true
  )
$$;

-- Trigger-/Policy-Funktion: nicht als RPC gedacht.
REVOKE EXECUTE ON FUNCTION app.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_admin() TO platedrop_app;


-- ---------------------------------------------------------------------------
-- verified_plates
-- ---------------------------------------------------------------------------
ALTER TABLE verified_plates ENABLE ROW LEVEL SECURITY;

-- Nutzer sehen ausschließlich ihre eigenen Kennzeichen.
CREATE POLICY "verified_plates_select_own" ON verified_plates
  FOR SELECT
  USING (app.current_user_id() IS NOT NULL AND user_id = app.current_user_id());

-- Admins sehen alle Kennzeichen (Freigabe-Ansicht unter /admin).
CREATE POLICY "verified_plates_select_admin" ON verified_plates
  FOR SELECT
  USING (app.is_admin());

CREATE POLICY "verified_plates_insert_own" ON verified_plates
  FOR INSERT
  WITH CHECK (
    app.current_user_id() IS NOT NULL
    AND user_id = app.current_user_id()
    -- Ein Claim startet immer unverifiziert. Ohne diese Bedingung könnte sich
    -- ein Nutzer beim Anlegen selbst freischalten.
    AND is_verified = false
    AND verification_status = 'pending'
  );

-- Nutzer dürfen nur das Beweisfoto nachreichen. is_verified und
-- verification_status bleiben für sie gesperrt.
CREATE POLICY "verified_plates_update_proof_only" ON verified_plates
  FOR UPDATE
  USING (app.current_user_id() IS NOT NULL AND user_id = app.current_user_id())
  WITH CHECK (
    user_id = app.current_user_id()
    AND is_verified = false
    AND verification_status IN ('pending', 'rejected')
  );

-- Admins genehmigen oder lehnen ab.
CREATE POLICY "verified_plates_update_admin" ON verified_plates
  FOR UPDATE
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

CREATE POLICY "verified_plates_delete_own" ON verified_plates
  FOR DELETE
  USING (app.current_user_id() IS NOT NULL AND user_id = app.current_user_id());


-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Öffentlich schreiben – ohne Konto, ohne Login. Das ist der Kern der App.
CREATE POLICY "messages_insert_public" ON messages
  FOR INSERT
  WITH CHECK (true);

-- Lesen nur für den Halter eines VERIFIZIERTEN Kennzeichens.
CREATE POLICY "messages_select_if_verified_owner" ON messages
  FOR SELECT
  USING (
    app.current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM verified_plates vp
      WHERE vp.user_id = app.current_user_id()
        AND vp.plate_number = messages.plate_number
        AND vp.is_verified = true
    )
  );

-- Nachrichten sind unveränderlich. Ohne UPDATE-/DELETE-Policy ist beides
-- ohnehin gesperrt; die explizite Form dokumentiert die Absicht.
CREATE POLICY "messages_no_update" ON messages FOR UPDATE USING (false);
CREATE POLICY "messages_no_delete" ON messages FOR DELETE USING (false);


-- ---------------------------------------------------------------------------
-- Rechte der App-Rolle
-- ---------------------------------------------------------------------------
-- Grants regeln, WAS die Rolle grundsätzlich darf; die Policies darüber
-- regeln, WELCHE ZEILEN sie dabei sieht. Beides zusammen ergibt den Schutz.
GRANT INSERT ON messages TO platedrop_app;
GRANT SELECT ON messages TO platedrop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON verified_plates TO platedrop_app;
