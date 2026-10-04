-- ===========================================================================
-- 0009 – Lesefenster: Nachrichten ab 30 Tage vor dem Anspruch
-- ===========================================================================
-- Kennzeichen werden neu vergeben. Bisher las ein frisch verifizierter Halter
-- alles, was je an das Kennzeichen ging – auch Nachrichten an den Vorbesitzer
-- oder an ein gelöschtes Konto. Jetzt reicht das Lesen bis 30 Tage vor dem
-- Anspruch (verified_plates.created_at) zurück: eine Notiz, die kurz vor der
-- Registrierung hinterlassen wurde, bleibt lesbar, Altes nicht.

-- Die Grenze an genau einer Stelle; Policy und src/lib/db/queries.ts nutzen
-- beide diese Funktion.
CREATE OR REPLACE FUNCTION app.message_read_since(claimed_at timestamptz) RETURNS timestamptz
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $$
  SELECT claimed_at - interval '30 days'
$$;

REVOKE EXECUTE ON FUNCTION app.message_read_since(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.message_read_since(timestamptz) TO platedrop_app;

DROP POLICY IF EXISTS "messages_select_if_verified_owner" ON messages;
CREATE POLICY "messages_select_if_verified_owner" ON messages
  FOR SELECT
  USING (
    app.current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM verified_plates vp
      WHERE vp.user_id = app.current_user_id()
        AND vp.plate_number = messages.plate_number
        AND vp.is_verified = true
        AND messages.created_at >= app.message_read_since(vp.created_at)
    )
  );
