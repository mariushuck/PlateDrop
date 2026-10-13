-- ===========================================================================
-- 0013 – Nachrichtentypen und Benachrichtigung per E-Mail
-- ===========================================================================
-- Zwei Probleme der bisherigen App (strategy.md §2):
--   * Der Halter erfuhr von einer Nachricht erst, wenn er das Dashboard öffnete.
--     „Dein Licht ist an" drei Tage später ist wertlos.
--   * Freitext von anonymen Absendern war das größte Missbrauchs- und
--     Haftungsrisiko.
-- Jetzt wählen anonyme Absender aus einem festen Katalog, und der Halter
-- bekommt eine E-Mail.
--
-- Versendet wird NICHT in der Server Action: Ihre Antwortzeit verriete, ob
-- hinter dem Kennzeichen ein Konto steht. Ein Trigger legt nur eine Zeile in
-- notification_outbox an; scripts/notifier.mjs verschickt außerhalb.

-- ---------------------------------------------------------------------------
-- Nachrichtentypen
-- ---------------------------------------------------------------------------
-- Die Codes stehen in src/lib/messages/catalog.json; ein Unit-Test hält
-- Katalog und diese Liste gleich.
ALTER TABLE messages ADD COLUMN message_type text;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
  CHECK (message_type IS NULL OR message_type IN (
    'licht_an', 'fenster_offen', 'tuer_offen', 'blockiert', 'abschleppen',
    'alarm', 'reifen', 'schaden_gesehen', 'danke'));

ALTER TABLE messages ALTER COLUMN message_text DROP NOT NULL;
ALTER TABLE messages ADD CONSTRAINT messages_has_content
  CHECK (message_type IS NOT NULL OR message_text IS NOT NULL);

-- Gelesen-Zeitpunkt: Messgröße „Zeit bis zur Reaktion" (go-to-market.md §8).
ALTER TABLE messages ADD COLUMN read_at timestamptz;
GRANT UPDATE (read_at) ON messages TO platedrop_app;

-- Anonyme Absender schreiben keinen Freitext mehr. Altbestand bleibt lesbar.
DROP POLICY "messages_insert_public" ON messages;
CREATE POLICY "messages_insert_public" ON messages
  FOR INSERT
  WITH CHECK (message_text IS NULL);

-- Spaltenscharfes INSERT: Zeitpunkt, Gelesen- und Ausgeblendet-Status setzt
-- die Datenbank. Ein rückdatierter created_at hätte das Stundenlimit je
-- Kennzeichen umgangen.
REVOKE INSERT ON messages FROM platedrop_app;
GRANT INSERT (plate_number, message_type, message_text) ON messages TO platedrop_app;

-- ---------------------------------------------------------------------------
-- Einstellungen je Nutzer
-- ---------------------------------------------------------------------------
-- Keine Zeile = Standard: E-Mail an, keine Ruhezeiten.
CREATE TABLE notification_settings (
  user_id       text        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  email_enabled boolean     NOT NULL DEFAULT true,
  -- Ruhezeiten als volle Stunden Europe/Berlin; beide gesetzt oder keine.
  quiet_start   smallint    CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end     smallint    CHECK (quiet_end BETWEEN 0 AND 23),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_settings_quiet_pair
    CHECK ((quiet_start IS NULL) = (quiet_end IS NULL))
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_settings_own" ON notification_settings
  FOR ALL
  USING (app.current_user_id() IS NOT NULL AND user_id = app.current_user_id())
  WITH CHECK (app.current_user_id() IS NOT NULL AND user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE ON notification_settings TO platedrop_app;

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
-- RLS an, keine Policy, kein Grant: an diese Tabelle kommen nur der Trigger und
-- der Notifier (als Owner).
CREATE TABLE notification_outbox (
  id              bigserial   PRIMARY KEY,
  message_id      uuid        NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id         text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plate_number    text        NOT NULL,
  message_type    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  attempts        integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  last_error      text
);

CREATE INDEX idx_notification_outbox_due
  ON notification_outbox (next_attempt_at) WHERE sent_at IS NULL;

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE notification_outbox FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.enqueue_notifications() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO notification_outbox (message_id, user_id, plate_number, message_type)
  SELECT NEW.id, vp.user_id, NEW.plate_number, NEW.message_type
    FROM verified_plates vp
    LEFT JOIN notification_settings s ON s.user_id = vp.user_id
   WHERE vp.plate_number = NEW.plate_number
     AND vp.is_verified = true
     AND (vp.paused_until IS NULL OR vp.paused_until <= now())
     AND coalesce(s.email_enabled, true)
     -- Bündeln: eine Benachrichtigung je Halter, Kennzeichen und Typ pro Viertelstunde.
     AND NOT EXISTS (
       SELECT 1 FROM notification_outbox o
        WHERE o.user_id = vp.user_id
          AND o.plate_number = NEW.plate_number
          AND o.message_type IS NOT DISTINCT FROM NEW.message_type
          AND o.created_at > now() - interval '15 minutes'
     );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.enqueue_notifications() FROM PUBLIC;

CREATE TRIGGER trg_enqueue_notifications
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION app.enqueue_notifications();

-- Für /api/health: wie alt ist der älteste noch offene Eintrag? Gibt nur eine
-- Zahl preis, keine Zeile.
CREATE OR REPLACE FUNCTION app.outbox_lag_seconds() RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT coalesce(extract(epoch FROM now() - min(created_at))::integer, 0)
    FROM notification_outbox
   WHERE sent_at IS NULL AND attempts < 10 AND next_attempt_at <= now()
$$;

REVOKE EXECUTE ON FUNCTION app.outbox_lag_seconds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.outbox_lag_seconds() TO platedrop_app;
