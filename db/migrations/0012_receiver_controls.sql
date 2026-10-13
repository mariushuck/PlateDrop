-- ===========================================================================
-- 0012 – Kontrolle für Empfänger: Ausblenden, Melden, Pausieren
-- ===========================================================================
-- Bisher konnte der Empfänger nichts tun: Nachrichten waren unveränderlich,
-- Melden gab es nicht. Für eine Plattform mit anonymen Absendern ist das zu
-- wenig, und der Digital Services Act verlangt ein Melde- und Abhilfeverfahren.
--
--   * Ausblenden: der Empfänger setzt messages.hidden_at. Der Inhalt bleibt für
--     eine Meldung oder Anzeige erhalten, bis die Löschfrist greift.
--   * Melden: message_reports; ein Admin sieht nur gemeldete Nachrichten und
--     darf nur diese löschen.
--   * Pausieren: verified_plates.paused_until, gesetzt über eine Funktion –
--     wirkt ab Migration 0013 auf die Benachrichtigungen.

-- ---------------------------------------------------------------------------
-- Lesebedingung an genau einer Stelle
-- ---------------------------------------------------------------------------
-- Bisher stand sie nur in der SELECT-Policy (0009). Jetzt brauchen sie auch die
-- UPDATE-Policy und die Melde-Policy; als Funktion kann sie nicht auseinander-
-- laufen. Läuft mit den Rechten des Aufrufers (kein SECURITY DEFINER): sie sieht
-- über RLS ohnehin nur dessen eigene Kennzeichen.
CREATE OR REPLACE FUNCTION app.can_read_message(m_plate text, m_created timestamptz)
  RETURNS boolean
  LANGUAGE sql
  STABLE
AS $$
  SELECT app.current_user_id() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM verified_plates vp
        WHERE vp.user_id = app.current_user_id()
          AND vp.plate_number = m_plate
          AND vp.is_verified = true
          AND m_created >= app.message_read_since(vp.created_at)
     )
$$;

REVOKE EXECUTE ON FUNCTION app.can_read_message(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_read_message(text, timestamptz) TO platedrop_app;

DROP POLICY "messages_select_if_verified_owner" ON messages;
CREATE POLICY "messages_select_if_verified_owner" ON messages
  FOR SELECT
  USING (app.can_read_message(plate_number, created_at));

-- ---------------------------------------------------------------------------
-- Ausblenden
-- ---------------------------------------------------------------------------
ALTER TABLE messages ADD COLUMN hidden_at timestamptz;

DROP POLICY "messages_no_update" ON messages;
CREATE POLICY "messages_update_hide_own" ON messages
  FOR UPDATE
  USING (app.can_read_message(plate_number, created_at))
  WITH CHECK (app.can_read_message(plate_number, created_at));

-- Nur diese eine Spalte: Text, Kennzeichen und Zeitpunkt bleiben unveränderlich.
GRANT UPDATE (hidden_at) ON messages TO platedrop_app;

-- ---------------------------------------------------------------------------
-- Melden
-- ---------------------------------------------------------------------------
CREATE TABLE message_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid        NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  reporter_id text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason      text        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT message_reports_once UNIQUE (message_id, reporter_id)
);

CREATE INDEX idx_message_reports_open ON message_reports (created_at) WHERE resolved_at IS NULL;

ALTER TABLE message_reports ENABLE ROW LEVEL SECURITY;

-- Melden darf nur, wer die Nachricht lesen darf – also ihr Empfänger.
CREATE POLICY "message_reports_insert_recipient" ON message_reports
  FOR INSERT
  WITH CHECK (
    reporter_id = app.current_user_id()
    AND resolved_at IS NULL
    AND EXISTS (
      SELECT 1 FROM messages m
       WHERE m.id = message_id
         AND app.can_read_message(m.plate_number, m.created_at)
    )
  );

CREATE POLICY "message_reports_select_own" ON message_reports
  FOR SELECT
  USING (reporter_id = app.current_user_id());

CREATE POLICY "message_reports_select_admin" ON message_reports
  FOR SELECT
  USING (app.is_admin());

CREATE POLICY "message_reports_update_admin" ON message_reports
  FOR UPDATE
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

GRANT SELECT, INSERT ON message_reports TO platedrop_app;
GRANT UPDATE (resolved_at) ON message_reports TO platedrop_app;

-- Ein Admin liest und löscht ausschließlich gemeldete Nachrichten. Alle übrigen
-- bleiben auch für ihn unsichtbar – das Kernversprechen gilt weiter.
CREATE POLICY "messages_select_reported_admin" ON messages
  FOR SELECT
  USING (
    app.is_admin()
    AND EXISTS (SELECT 1 FROM message_reports r WHERE r.message_id = messages.id)
  );

DROP POLICY "messages_no_delete" ON messages;
CREATE POLICY "messages_delete_reported_admin" ON messages
  FOR DELETE
  USING (
    app.is_admin()
    AND EXISTS (SELECT 1 FROM message_reports r WHERE r.message_id = messages.id)
  );

GRANT DELETE ON messages TO platedrop_app;

-- ---------------------------------------------------------------------------
-- Pausieren
-- ---------------------------------------------------------------------------
ALTER TABLE verified_plates ADD COLUMN paused_until timestamptz;

-- Bewusst eine Funktion statt einer UPDATE-Policy für freigegebene Kennzeichen:
-- eine Policy gilt für die ganze Zeile, und der Halter könnte damit auch
-- proof_image_url auf ein fremdes Beweisfoto setzen und es über canReadProof
-- lesen. Der Spalten-Grant aus 0011 erfasst paused_until deshalb nicht.
CREATE OR REPLACE FUNCTION app.set_plate_pause(p_plate uuid, p_until timestamptz)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  WITH changed AS (
    UPDATE verified_plates
       SET paused_until = p_until
     WHERE id = p_plate
       AND app.current_user_id() IS NOT NULL
       AND user_id = app.current_user_id()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM changed)
$$;

REVOKE EXECUTE ON FUNCTION app.set_plate_pause(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_plate_pause(uuid, timestamptz) TO platedrop_app;
