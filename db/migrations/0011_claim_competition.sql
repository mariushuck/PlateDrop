-- ===========================================================================
-- 0011 – Claim-Konkurrenz statt Kennzeichen-Sperre
-- ===========================================================================
-- Bisher galt UNIQUE (plate_number) über alle Zeilen. Wer ein fremdes
-- Kennzeichen beanspruchte und nie ein Foto hochlud, sperrte den echten Halter
-- dauerhaft aus; beim Halterwechsel bekam der neue Halter „bereits
-- registriert" – und erfuhr damit nebenbei, dass jemand das Kennzeichen nutzt.
--
-- Jetzt ist nur der FREIGEGEBENE Claim eindeutig. Offene Claims mehrerer Nutzer
-- bestehen nebeneinander; bei der Freigabe löst setPlateVerification (queries.ts)
-- die Konkurrenz auf: andere offene → rejected, bisheriger Halter → superseded.
-- Unbelegte Claims ohne Foto verfallen nach 7 Tagen (scripts/prune-claims.mjs).

ALTER TABLE verified_plates DROP CONSTRAINT verified_plates_plate_unique;
-- idx_verified_plates_plate (0003) bleibt der Lookup-Index für plate_number.

CREATE UNIQUE INDEX verified_plates_one_approved
  ON verified_plates (plate_number)
  WHERE verification_status = 'approved';

-- Derselbe Nutzer beansprucht ein Kennzeichen nur einmal gleichzeitig.
CREATE UNIQUE INDEX verified_plates_one_open_per_user
  ON verified_plates (user_id, plate_number)
  WHERE verification_status IN ('pending', 'approved');

ALTER TABLE verified_plates DROP CONSTRAINT verified_plates_status_check;
ALTER TABLE verified_plates ADD CONSTRAINT verified_plates_status_check
  CHECK (verification_status IN ('pending', 'approved', 'rejected', 'expired', 'superseded'));

-- Lesezugriff hängt an is_verified (Policy messages_select_if_verified_owner).
-- Die Kopplung an den Status macht einen abgelösten oder verfallenen Halter
-- unabhängig von der Query-Schicht zum Nicht-Leser.
UPDATE verified_plates SET is_verified = (verification_status = 'approved')
 WHERE is_verified <> (verification_status = 'approved');
ALTER TABLE verified_plates ADD CONSTRAINT verified_plates_verified_matches_status
  CHECK (is_verified = (verification_status = 'approved'));

-- Spaltenscharfes UPDATE wie bei users (0007). Bisher durfte ein Halter per
-- UPDATE auch plate_number oder user_id seines offenen Claims umschreiben.
REVOKE UPDATE ON verified_plates FROM platedrop_app;
GRANT UPDATE (proof_image_url, verification_status, is_verified) ON verified_plates
  TO platedrop_app;
