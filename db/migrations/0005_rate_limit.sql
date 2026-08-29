-- ===========================================================================
-- 0005 – Spam-Schutz
-- ===========================================================================
-- Unverändert aus dem Supabase-Schema übernommen: beides ist reines Postgres
-- und funktioniert lokal genauso. Zwei Ebenen, beide ohne Klartext-IP.

-- ---------------------------------------------------------------------------
-- (a) Pro Kennzeichen – Trigger, vollständig anonym
-- ---------------------------------------------------------------------------
-- Deckelt, wie viele Nachrichten ein einzelnes Kennzeichen pro Stunde
-- empfangen kann. Backstop gegen gezieltes Fluten.
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

-- Trigger-Funktionen feuern unabhängig vom EXECUTE-Recht – von der API fernhalten.
REVOKE EXECUTE ON FUNCTION enforce_message_rate_limit() FROM PUBLIC;


-- ---------------------------------------------------------------------------
-- (b) Pro Absender – pseudonymisiert
-- ---------------------------------------------------------------------------
-- Die Server Action übergibt einen gesalzenen, täglich rotierenden SHA-256-
-- Hash der Client-IP, nie die IP selbst (src/lib/utils/rateLimit.ts). Die
-- Funktion pflegt daraus atomar ein rollierendes Fenster.
ALTER TABLE message_throttle ENABLE ROW LEVEL SECURITY;

-- Keine Policies und kein Grant: an diese Tabelle kommt ausschließlich die
-- SECURITY-DEFINER-Funktion unten heran.
REVOKE ALL ON TABLE message_throttle FROM PUBLIC;

CREATE OR REPLACE FUNCTION check_message_rate(p_ip_hash text)
RETURNS boolean AS $$
DECLARE
  max_per_window constant integer  := 10;                     -- Anfragen ...
  window_length  constant interval := interval '1 minute';    -- ... pro Minute
  current_count integer;
  current_start timestamptz;
BEGIN
  IF p_ip_hash IS NULL OR length(p_ip_hash) = 0 THEN
    -- Absender nicht bestimmbar: durchlassen, der Trigger aus (a) bleibt aktiv.
    RETURN true;
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

REVOKE EXECUTE ON FUNCTION check_message_rate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_message_rate(text) TO platedrop_app;
