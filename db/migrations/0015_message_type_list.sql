-- ===========================================================================
-- 0015 – Mehrere Gründe je Nachricht
-- ===========================================================================
-- Statt genau eines vordefinierten Typs trägt eine Nachricht jetzt eine Liste
-- (`message_types text[]`) – eine Nachricht, eine Mail, ein Zähler im
-- Rate-Limit. Der Katalog (src/lib/messages/catalog.json) wächst und bekommt
-- Kategorien; der CHECK unten listet dieselben Codes in derselben Reihenfolge
-- (__tests__/lib/messageCatalog.test.ts).
--
-- Bestehende Zeilen werden zu einelementigen Listen. Umbenennen und Typwechsel
-- behalten die spaltenbezogenen Rechte aus 0013/0014: Postgres hängt sie an die
-- Spalte, nicht an ihren Namen.

ALTER TABLE messages DROP CONSTRAINT messages_type_check;
ALTER TABLE messages ALTER COLUMN message_type TYPE text[]
  USING CASE WHEN message_type IS NULL THEN NULL ELSE ARRAY[message_type] END;
ALTER TABLE messages RENAME COLUMN message_type TO message_types;
ALTER TABLE messages ADD CONSTRAINT messages_types_check CHECK (
  message_types IS NULL OR (
    cardinality(message_types) >= 1
    AND message_types <@ ARRAY[
    'licht_an', 'innenlicht_an', 'warnblinker_an', 'motor_laeuft', 'alarm',
    'licht_defekt', 'fenster_offen', 'verdeck_offen', 'tuer_offen',
    'schluessel_sichtbar', 'tankklappe_offen', 'wertsachen_sichtbar',
    'gegenstand_auf_dach', 'blockiert', 'rettungsweg', 'weggerollt',
    'abschleppen', 'halteverbot', 'fremder_stellplatz', 'zwei_stellplaetze',
    'zu_dicht', 'strafzettel', 'parkzeit_abgelaufen', 'ladesaeule_belegt',
    'reifen', 'schaden_gesehen', 'angefahren', 'scheibe_beschaedigt',
    'einbruchsspuren', 'fluessigkeit', 'spiegel_beschaedigt',
    'kennzeichen_lose', 'hu_abgelaufen', 'unwetter', 'hochwasser', 'ast_baum',
    'tier_am_fahrzeug', 'mobiles_halteverbot', 'bauarbeiten',
    'gegenstand_verloren', 'danke'
    ]::text[]));

ALTER TABLE notification_outbox ALTER COLUMN message_type TYPE text[]
  USING CASE WHEN message_type IS NULL THEN NULL ELSE ARRAY[message_type] END;
ALTER TABLE notification_outbox RENAME COLUMN message_type TO message_types;

-- Wie 0014, bis auf die Bündelung: Eine Nachricht wird nur unterdrückt, wenn
-- dieselbe Person in den letzten 15 Minuten für dieses Kennzeichen schon über
-- ALLE ihre Gründe benachrichtigt wurde. Ein neuer Grund löst immer eine Mail aus.
CREATE OR REPLACE FUNCTION app.enqueue_notifications() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO notification_outbox (message_id, user_id, plate_number, message_types)
  SELECT NEW.id, vp.user_id, NEW.plate_number, NEW.message_types
    FROM verified_plates vp
    LEFT JOIN notification_settings s ON s.user_id = vp.user_id
   WHERE vp.plate_number = NEW.plate_number
     AND vp.is_verified = true
     AND vp.org_id IS NOT DISTINCT FROM NEW.org_id
     AND (NEW.site_id IS NULL OR EXISTS (
           SELECT 1 FROM site_members sm
            WHERE sm.site_id = NEW.site_id AND sm.user_id = vp.user_id AND sm.status = 'active'))
     AND vp.user_id IS DISTINCT FROM NEW.sender_id
     AND (vp.paused_until IS NULL OR vp.paused_until <= now())
     AND coalesce(s.email_enabled, true)
     AND NOT EXISTS (
       SELECT 1 FROM notification_outbox o
        WHERE o.user_id = vp.user_id
          AND o.plate_number = NEW.plate_number
          AND (o.message_types @> NEW.message_types
               OR (o.message_types IS NULL AND NEW.message_types IS NULL))
          AND o.created_at > now() - interval '15 minutes'
     );
  RETURN NEW;
END;
$$;
