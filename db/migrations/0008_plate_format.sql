-- ===========================================================================
-- 0008 – Kennzeichen mit Trennstrichen speichern
-- ===========================================================================
-- Bis hierher wurden Kennzeichen ohne Trennzeichen gespeichert: "KAAB1234".
-- Damit fielen verschiedene Kennzeichen auf denselben Wert – "K-AB 1234"
-- (Köln) und "KA-B 1234" (Karlsruhe) wurden beide zu "KAB1234", und wer eines
-- davon verifizierte, las die Nachrichten an das andere.
--
-- Ab jetzt gilt die Form ORT-BUCHSTABEN-ZAHL, z. B. "KA-AB-1234"
-- (src/lib/utils/plateUtils.ts). Diese Datei ist bewusst wiederholbar
-- geschrieben; der Migrationstest spielt sie nach dem Einfügen von Altdaten
-- ein zweites Mal ein.

-- ---------------------------------------------------------------------------
-- 1. Eindeutige Altdaten umwandeln
-- ---------------------------------------------------------------------------
-- Altdaten enthalten nur A–Z. Ein Buchstabenblock lässt sich genau dann nur
-- auf eine Weise in Ortskürzel (1–3) und Buchstaben (1–2) teilen, wenn er
-- 2 (1+1) oder 5 (3+2) Zeichen lang ist. Alles dazwischen ist mehrdeutig.
UPDATE verified_plates
   SET plate_number = regexp_replace(plate_number, '^([A-Z])([A-Z])([1-9][0-9]{0,3}[EH]?)$', '\1-\2-\3')
 WHERE plate_number ~ '^[A-Z]{2}[1-9][0-9]{0,3}[EH]?$';

UPDATE verified_plates
   SET plate_number = regexp_replace(plate_number, '^([A-Z]{3})([A-Z]{2})([1-9][0-9]{0,3}[EH]?)$', '\1-\2-\3')
 WHERE plate_number ~ '^[A-Z]{5}[1-9][0-9]{0,3}[EH]?$';

UPDATE messages
   SET plate_number = regexp_replace(plate_number, '^([A-Z])([A-Z])([1-9][0-9]{0,3}[EH]?)$', '\1-\2-\3')
 WHERE plate_number ~ '^[A-Z]{2}[1-9][0-9]{0,3}[EH]?$';

UPDATE messages
   SET plate_number = regexp_replace(plate_number, '^([A-Z]{3})([A-Z]{2})([1-9][0-9]{0,3}[EH]?)$', '\1-\2-\3')
 WHERE plate_number ~ '^[A-Z]{5}[1-9][0-9]{0,3}[EH]?$';

-- ---------------------------------------------------------------------------
-- 2. Mehrdeutigen Ansprüchen die Freigabe entziehen
-- ---------------------------------------------------------------------------
-- Welches Kennzeichen gemeint war, zeigt nur das Beweisfoto. Bis ein Admin es
-- zuordnet (docs/admin.md A3), liest niemand Nachrichten darüber. `pending`
-- statt `rejected`: der Halter soll kein neues Foto hochladen – das würde an
-- der Formatprüfung unten scheitern –, sondern auf die Zuordnung warten.
-- Nachrichten an mehrdeutige Altkennzeichen werden nicht umgehängt; sie
-- passen zu keinem Kennzeichen mehr und bleiben unlesbar.
UPDATE verified_plates
   SET is_verified = false,
       verification_status = 'pending'
 WHERE plate_number !~ '^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}-[1-9][0-9]{0,3}[EH]?$';

-- ---------------------------------------------------------------------------
-- 3. Formatprüfung für alle neuen und geänderten Zeilen
-- ---------------------------------------------------------------------------
-- NOT VALID: bestehende Altzeilen bleiben stehen, jedes INSERT und UPDATE wird
-- aber geprüft. Kein Schreibweg kann die Normalisierung damit umgehen.
ALTER TABLE verified_plates DROP CONSTRAINT IF EXISTS verified_plates_plate_format_check;
ALTER TABLE verified_plates
  ADD CONSTRAINT verified_plates_plate_format_check
  CHECK (plate_number ~ '^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}-[1-9][0-9]{0,3}[EH]?$') NOT VALID;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_plate_format_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_plate_format_check
  CHECK (plate_number ~ '^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}-[1-9][0-9]{0,3}[EH]?$') NOT VALID;
