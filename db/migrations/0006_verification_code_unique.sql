-- ===========================================================================
-- 0006 – Verifizierungscode eindeutig
-- ===========================================================================
-- Der Code (Format XX-XXXX) ist das einzige Geheimnis, das einen Kennzeichen-
-- Claim an die physische Windschutzscheiben-Prüfung bindet, die ein Admin
-- visuell abgleicht. Er wird jetzt kryptografisch erzeugt
-- (src/app/dashboard/actions.ts). Ein UNIQUE-Constraint schließt stille
-- Kollisionen aus; die Insert-Query würfelt bei einem Treffer neu.

-- Falls in einer bestehenden Datenbank noch Doppel-Codes aus der Zeit mit
-- Math.random() liegen: alle bis auf den ältesten Treffer je Code auf NULL
-- setzen. Die betroffenen Halter reichen ihr Beweisfoto dann mit einem frisch
-- erzeugten Code erneut ein.
WITH dupes AS (
  SELECT id,
         row_number() OVER (PARTITION BY verification_code ORDER BY created_at, id) AS rn
  FROM verified_plates
  WHERE verification_code IS NOT NULL
)
UPDATE verified_plates vp
   SET verification_code = NULL
  FROM dupes
 WHERE dupes.id = vp.id
   AND dupes.rn > 1;

-- NULL bleibt erlaubt (mehrfach) – ein Claim ohne Code ist ein gültiger
-- Zwischenzustand.
ALTER TABLE verified_plates
  ADD CONSTRAINT verified_plates_verification_code_key UNIQUE (verification_code);
