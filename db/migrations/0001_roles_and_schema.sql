-- ===========================================================================
-- 0001 – Rollen, app-Schema und der Ersatz für Supabases auth.uid()
-- ===========================================================================
-- Die Rolle `platedrop_app` legt der Migrations-Runner an (ohne SUPERUSER und
-- ohne BYPASSRLS). Diese Datei richtet nur ein, was sie sehen darf.

CREATE SCHEMA IF NOT EXISTS app;

-- ---------------------------------------------------------------------------
-- Identität der laufenden Anfrage
-- ---------------------------------------------------------------------------
-- Unter Supabase kam die Nutzer-ID aus dem JWT (auth.uid()). Ohne PostgREST
-- setzt die Anwendung sie stattdessen pro Transaktion als lokale Session-
-- Variable (siehe src/lib/db/context.ts). `true` als zweites Argument von
-- current_setting sorgt dafür, dass eine fehlende Variable NULL liefert statt
-- einen Fehler zu werfen – anonyme Anfragen sind ein gültiger Zustand.
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$;

GRANT USAGE ON SCHEMA app TO platedrop_app;
GRANT USAGE ON SCHEMA public TO platedrop_app;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO platedrop_app;
