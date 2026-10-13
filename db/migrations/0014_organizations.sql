-- ===========================================================================
-- 0014 – Organisationen: PlateDrop für Privatgelände
-- ===========================================================================
-- Ein Betreiber (Firma, Hausverwaltung, Hotel …) hat Standorte; Mitglieder
-- gehören zu Standorten, nicht nur zur Organisation – eine Hausverwaltung
-- betreut viele Objekte, eine Firma mehrere Werke (go-to-market.md §4).
--
--   organizations        Betreiber, Einstellungen (Absendername, Freitext)
--   org_sites            Standort mit QR-Token für Schild und Aushang
--   org_admins           wer die Organisation verwaltet
--   site_members         Mitgliedschaft je Standort, pending bis zur Freigabe
--   org_plate_allowlist  Fuhrpark-/Parkausweisliste: passende Claims gelten sofort
--
-- Trennung der Mandanten: Ein Kennzeichen ist öffentlich (org_id NULL) oder
-- gehört zu genau einer Organisation. Eine Nachricht erreicht nur den Halter
-- im selben Bereich, und bei einer Standort-Nachricht nur, wenn er dort aktives
-- Mitglied ist. Org-Admins verwalten, lesen aber keine fremden Nachrichten.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  slug            text        NOT NULL UNIQUE
                              CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
  -- Sieht der Empfänger, wer geschrieben hat? Standard: nein.
  show_sender     boolean     NOT NULL DEFAULT false,
  -- Dürfen angemeldete Mitglieder Freitext schicken? Anonyme nie.
  allow_free_text boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_sites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  -- 128 Bit base64url (src/lib/tags/token.ts); steht im QR-Code.
  token       text        NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{22}$'),
  disabled_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Ziel des zusammengesetzten Fremdschlüssels aus messages.
  CONSTRAINT org_sites_id_org UNIQUE (id, org_id)
);
CREATE INDEX idx_org_sites_org ON org_sites (org_id);

CREATE TABLE org_admins (
  org_id     uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX idx_org_admins_user ON org_admins (user_id);

CREATE TABLE site_members (
  site_id    uuid        NOT NULL REFERENCES org_sites (id) ON DELETE CASCADE,
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, user_id)
);
CREATE INDEX idx_site_members_user ON site_members (user_id);

CREATE TABLE org_plate_allowlist (
  org_id       uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  plate_number text        NOT NULL
                           CHECK (plate_number ~ '^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}-[1-9][0-9]{0,3}[EH]?$'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, plate_number)
);

-- ---------------------------------------------------------------------------
-- Kennzeichen und Nachrichten bekommen einen Bereich
-- ---------------------------------------------------------------------------
ALTER TABLE verified_plates ADD COLUMN org_id uuid REFERENCES organizations (id) ON DELETE CASCADE;
CREATE INDEX idx_verified_plates_org ON verified_plates (org_id) WHERE org_id IS NOT NULL;

-- Eindeutigkeit jetzt je Bereich; öffentlich (NULL) zählt als ein Bereich.
DROP INDEX verified_plates_one_approved;
CREATE UNIQUE INDEX verified_plates_one_approved
  ON verified_plates (org_id, plate_number) NULLS NOT DISTINCT
  WHERE verification_status = 'approved';
DROP INDEX verified_plates_one_open_per_user;
CREATE UNIQUE INDEX verified_plates_one_open_per_user
  ON verified_plates (user_id, org_id, plate_number) NULLS NOT DISTINCT
  WHERE verification_status IN ('pending', 'approved');

ALTER TABLE messages ADD COLUMN org_id uuid;
ALTER TABLE messages ADD COLUMN site_id uuid;
ALTER TABLE messages ADD COLUMN sender_id text REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE messages ADD CONSTRAINT messages_site_in_org
  FOREIGN KEY (site_id, org_id) REFERENCES org_sites (id, org_id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_org_needs_site
  CHECK ((org_id IS NULL) = (site_id IS NULL));
CREATE INDEX idx_messages_site_created ON messages (site_id, created_at) WHERE site_id IS NOT NULL;

GRANT INSERT (org_id, site_id, sender_id) ON messages TO platedrop_app;

-- Die Absender-ID ist für die App-Rolle nicht lesbar: über users ließe sie sich
-- sonst auch dann einer Person zuordnen, wenn die Organisation den Absender
-- verbirgt. Den Namen gibt app.message_sender_name() heraus – nur wenn erlaubt.
REVOKE SELECT ON messages FROM platedrop_app;
GRANT SELECT (id, plate_number, message_type, message_text, created_at, hidden_at, read_at,
              org_id, site_id)
  ON messages TO platedrop_app;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (SECURITY DEFINER: lesen an RLS vorbei, geben nur Ja/Nein
-- oder genau die benötigten Werte heraus)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_org_admin(p_org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_admins WHERE org_id = p_org AND user_id = app.current_user_id()
  )
$$;

-- Aktives Mitglied an irgendeinem Standort der Organisation.
CREATE OR REPLACE FUNCTION app.is_org_member(p_org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM site_members sm JOIN org_sites s ON s.id = sm.site_id
     WHERE s.org_id = p_org AND sm.user_id = app.current_user_id() AND sm.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION app.site_org(p_site uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT org_id FROM org_sites WHERE id = p_site
$$;

CREATE OR REPLACE FUNCTION app.site_is_active(p_site uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM org_sites WHERE id = p_site AND disabled_at IS NULL)
$$;

-- Freitext nur von aktiven Mitgliedern des Standorts, wenn die Organisation ihn erlaubt.
CREATE OR REPLACE FUNCTION app.may_send_free_text(p_site uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_sites s
      JOIN organizations o ON o.id = s.org_id
      JOIN site_members sm ON sm.site_id = s.id
     WHERE s.id = p_site AND o.allow_free_text
       AND sm.user_id = app.current_user_id() AND sm.status = 'active'
  )
$$;

-- Öffentliches Standort-Formular: löst genau ein Token auf, sonst nichts.
CREATE OR REPLACE FUNCTION app.site_by_token(p_token text)
  RETURNS TABLE (site_id uuid, site_name text, org_id uuid, org_name text, org_slug text,
                 allow_free_text boolean, show_sender boolean, active boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.name, o.id, o.name, o.slug, o.allow_free_text, o.show_sender,
         s.disabled_at IS NULL
    FROM org_sites s JOIN organizations o ON o.id = s.org_id
   WHERE s.token = p_token
$$;

-- ---------------------------------------------------------------------------
-- Lesebedingung – weiterhin an genau einer Stelle, jetzt mit Bereich
-- ---------------------------------------------------------------------------
DROP POLICY "messages_select_if_verified_owner" ON messages;
DROP POLICY "messages_update_hide_own" ON messages;
DROP POLICY "message_reports_insert_recipient" ON message_reports;
DROP FUNCTION app.can_read_message(text, timestamptz);

CREATE OR REPLACE FUNCTION app.can_read_message(
  m_plate text, m_created timestamptz, m_org uuid, m_site uuid
) RETURNS boolean
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
          -- Öffentlich bleibt öffentlich, Organisation bleibt Organisation.
          AND vp.org_id IS NOT DISTINCT FROM m_org
          AND (m_site IS NULL OR EXISTS (
                SELECT 1 FROM site_members sm
                 WHERE sm.site_id = m_site AND sm.user_id = vp.user_id AND sm.status = 'active'))
     )
$$;

REVOKE EXECUTE ON FUNCTION app.can_read_message(text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_read_message(text, timestamptz, uuid, uuid) TO platedrop_app;

CREATE POLICY "messages_select_if_verified_owner" ON messages
  FOR SELECT
  USING (app.can_read_message(plate_number, created_at, org_id, site_id));

CREATE POLICY "messages_update_hide_own" ON messages
  FOR UPDATE
  USING (app.can_read_message(plate_number, created_at, org_id, site_id))
  WITH CHECK (app.can_read_message(plate_number, created_at, org_id, site_id));

CREATE POLICY "message_reports_insert_recipient" ON message_reports
  FOR INSERT
  WITH CHECK (
    reporter_id = app.current_user_id()
    AND resolved_at IS NULL
    AND EXISTS (
      SELECT 1 FROM messages m
       WHERE m.id = message_id
         AND app.can_read_message(m.plate_number, m.created_at, m.org_id, m.site_id)
    )
  );

-- Absendername für den Empfänger: nur wenn die Organisation ihn zeigt und der
-- Aufrufer die Nachricht lesen darf. Leerer Name → „Mitglied".
CREATE OR REPLACE FUNCTION app.message_sender_name(p_message uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(nullif(u.name, ''), 'Mitglied')
    FROM messages m
    JOIN organizations o ON o.id = m.org_id AND o.show_sender
    JOIN users u ON u.id = m.sender_id
   WHERE m.id = p_message
     AND app.can_read_message(m.plate_number, m.created_at, m.org_id, m.site_id)
$$;

-- ---------------------------------------------------------------------------
-- Schreiben: Absender, Freitext, Standort
-- ---------------------------------------------------------------------------
DROP POLICY "messages_insert_public" ON messages;
CREATE POLICY "messages_insert_public" ON messages
  FOR INSERT
  WITH CHECK (
    -- Ein Absender kann nur sich selbst eintragen.
    (sender_id IS NULL OR sender_id = app.current_user_id())
    AND (site_id IS NULL OR app.site_is_active(site_id))
    -- Freitext nur angemeldet, am Standort aktiv und von der Organisation erlaubt.
    AND (message_text IS NULL
         OR (sender_id IS NOT NULL AND site_id IS NOT NULL AND app.may_send_free_text(site_id)))
  );

-- Das Stundenlimit zählt je Bereich: Spam an ein öffentliches Kennzeichen
-- blockiert nicht den Firmenparkplatz mit derselben Nummer.
CREATE OR REPLACE FUNCTION enforce_message_rate_limit()
RETURNS trigger AS $$
DECLARE
  recent_count integer;
  max_per_hour constant integer := 20;
BEGIN
  SELECT count(*) INTO recent_count
  FROM messages
  WHERE plate_number = NEW.plate_number
    AND org_id IS NOT DISTINCT FROM NEW.org_id
    AND created_at > now() - interval '1 hour';

  IF recent_count >= max_per_hour THEN
    RAISE EXCEPTION 'message rate limit exceeded for plate'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Benachrichtigung mit derselben Bereichsregel wie das Lesen.
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
          AND o.message_type IS NOT DISTINCT FROM NEW.message_type
          AND o.created_at > now() - interval '15 minutes'
     );
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Kennzeichen in Organisationen
-- ---------------------------------------------------------------------------
-- Beanspruchen nur als Mitglied der Organisation.
DROP POLICY "verified_plates_insert_own" ON verified_plates;
CREATE POLICY "verified_plates_insert_own" ON verified_plates
  FOR INSERT
  WITH CHECK (
    app.current_user_id() IS NOT NULL
    AND user_id = app.current_user_id()
    AND is_verified = false
    AND verification_status = 'pending'
    AND (org_id IS NULL OR app.is_org_member(org_id))
  );

CREATE POLICY "verified_plates_select_org_admin" ON verified_plates
  FOR SELECT
  USING (org_id IS NOT NULL AND app.is_org_admin(org_id));

CREATE POLICY "verified_plates_update_org_admin" ON verified_plates
  FOR UPDATE
  USING (org_id IS NOT NULL AND app.is_org_admin(org_id))
  WITH CHECK (org_id IS NOT NULL AND app.is_org_admin(org_id));

-- Fuhrparkliste: Ein Claim auf ein gelistetes Kennzeichen gilt sofort, sofern
-- in der Organisation noch niemand dafür freigegeben ist.
CREATE OR REPLACE FUNCTION app.approve_allowlisted_claim() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.org_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM org_plate_allowlist a
                  WHERE a.org_id = NEW.org_id AND a.plate_number = NEW.plate_number)
     AND NOT EXISTS (SELECT 1 FROM verified_plates vp
                      WHERE vp.org_id = NEW.org_id AND vp.plate_number = NEW.plate_number
                        AND vp.verification_status = 'approved')
  THEN
    UPDATE verified_plates SET is_verified = true, verification_status = 'approved'
     WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.approve_allowlisted_claim() FROM PUBLIC;

CREATE TRIGGER trg_approve_allowlisted_claim
  AFTER INSERT ON verified_plates
  FOR EACH ROW EXECUTE FUNCTION app.approve_allowlisted_claim();

-- Offboarding: Wer an keinem Standort der Organisation mehr aktiv ist, verliert
-- seine Kennzeichen dort sofort (expired) – egal ob er ging oder entfernt wurde.
CREATE OR REPLACE FUNCTION app.expire_plates_without_membership() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := (SELECT org_id FROM org_sites WHERE id = OLD.site_id);
BEGIN
  IF v_org IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM site_members sm JOIN org_sites s ON s.id = sm.site_id
        WHERE s.org_id = v_org AND sm.user_id = OLD.user_id AND sm.status = 'active')
  THEN
    UPDATE verified_plates
       SET is_verified = false, verification_status = 'expired'
     WHERE org_id = v_org AND user_id = OLD.user_id
       AND verification_status IN ('pending', 'approved');
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.expire_plates_without_membership() FROM PUBLIC;

CREATE TRIGGER trg_expire_plates_without_membership
  AFTER DELETE OR UPDATE OF status ON site_members
  FOR EACH ROW EXECUTE FUNCTION app.expire_plates_without_membership();

-- ---------------------------------------------------------------------------
-- Policies der neuen Tabellen
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_plate_allowlist ENABLE ROW LEVEL SECURITY;

-- organizations: sehen Mitglieder und Org-Admins; Einstellungen ändern nur
-- Org-Admins. Anlegen und Löschen nur per Skript als Owner.
CREATE POLICY "organizations_select_member" ON organizations
  FOR SELECT USING (app.is_org_admin(id) OR app.is_org_member(id));
CREATE POLICY "organizations_update_admin" ON organizations
  FOR UPDATE USING (app.is_org_admin(id)) WITH CHECK (app.is_org_admin(id));
GRANT SELECT ON organizations TO platedrop_app;
GRANT UPDATE (name, show_sender, allow_free_text) ON organizations TO platedrop_app;

-- org_sites: Org-Admins verwalten; Nutzer sehen Standorte, an denen sie
-- Mitglied sind oder es werden wollen. Das Token sehen nur Org-Admins.
CREATE POLICY "org_sites_admin" ON org_sites
  FOR ALL USING (app.is_org_admin(org_id)) WITH CHECK (app.is_org_admin(org_id));
CREATE POLICY "org_sites_select_member" ON org_sites
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM site_members sm WHERE sm.site_id = org_sites.id
       AND sm.user_id = app.current_user_id()));
GRANT SELECT, INSERT ON org_sites TO platedrop_app;
GRANT UPDATE (name, token, disabled_at) ON org_sites TO platedrop_app;

-- org_admins: man sieht die eigene Rolle und die Mit-Admins; vergeben per Skript.
CREATE POLICY "org_admins_select" ON org_admins
  FOR SELECT USING (user_id = app.current_user_id() OR app.is_org_admin(org_id));
GRANT SELECT ON org_admins TO platedrop_app;

-- site_members: eigene Mitgliedschaft sehen, beantragen (pending) und beenden;
-- Org-Admins sehen, bestätigen und entfernen.
CREATE POLICY "site_members_select" ON site_members
  FOR SELECT USING (user_id = app.current_user_id() OR app.is_org_admin(app.site_org(site_id)));
CREATE POLICY "site_members_request_own" ON site_members
  FOR INSERT WITH CHECK (
    user_id = app.current_user_id() AND status = 'pending' AND app.site_is_active(site_id));
CREATE POLICY "site_members_update_admin" ON site_members
  FOR UPDATE USING (app.is_org_admin(app.site_org(site_id)))
  WITH CHECK (app.is_org_admin(app.site_org(site_id)));
CREATE POLICY "site_members_delete" ON site_members
  FOR DELETE USING (user_id = app.current_user_id() OR app.is_org_admin(app.site_org(site_id)));
GRANT SELECT, INSERT, DELETE ON site_members TO platedrop_app;
GRANT UPDATE (status) ON site_members TO platedrop_app;

CREATE POLICY "org_plate_allowlist_admin" ON org_plate_allowlist
  FOR ALL USING (app.is_org_admin(org_id)) WITH CHECK (app.is_org_admin(org_id));
GRANT SELECT, INSERT, DELETE ON org_plate_allowlist TO platedrop_app;

-- ---------------------------------------------------------------------------
-- Statistik: nur Zahlen je Woche und Standort, nie je Person
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.org_weekly_stats(p_org uuid)
  RETURNS TABLE (week date, site_name text, incidents bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT date_trunc('week', m.created_at)::date, s.name, count(*)
    FROM messages m JOIN org_sites s ON s.id = m.site_id
   WHERE app.is_org_admin(p_org)
     AND m.org_id = p_org
     AND m.created_at > now() - interval '12 weeks'
   GROUP BY 1, 2
   ORDER BY 1 DESC, 2
$$;

-- ---------------------------------------------------------------------------
-- Rechte an den Funktionen
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION app.is_org_admin(uuid), app.is_org_member(uuid), app.site_org(uuid),
  app.site_is_active(uuid), app.may_send_free_text(uuid), app.site_by_token(text),
  app.message_sender_name(uuid), app.org_weekly_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_org_admin(uuid), app.is_org_member(uuid), app.site_org(uuid),
  app.site_is_active(uuid), app.may_send_free_text(uuid), app.site_by_token(text),
  app.message_sender_name(uuid), app.org_weekly_stats(uuid) TO platedrop_app;

-- ---------------------------------------------------------------------------
-- Anzeigename statt E-Mail
-- ---------------------------------------------------------------------------
-- signUp trug bisher die E-Mail als Namen ein. Mit show_sender würde sie sonst
-- Empfängern angezeigt, und nach einer E-Mail-Änderung bliebe die alte stehen.
UPDATE users SET name = '' WHERE name = email;
