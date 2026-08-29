-- ===========================================================================
-- 0003 – Fachtabellen
-- ===========================================================================
-- Übernommen aus dem Supabase-Schema. Zwei Anpassungen:
--   * user_id ist `text` statt `uuid` – better-auth vergibt Text-IDs.
--   * Die frühere `profiles`-Tabelle entfällt; is_admin sitzt auf `users`.

CREATE TABLE verified_plates (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plate_number        text        NOT NULL,
  is_verified         boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  verification_status text        NOT NULL DEFAULT 'pending',
  -- Code, den der Halter sichtbar hinter die Windschutzscheibe legt.
  verification_code   text,
  -- Objektpfad im proofs-Verzeichnis, nie eine öffentliche URL.
  proof_image_url     text,
  CONSTRAINT verified_plates_plate_unique UNIQUE (plate_number),
  CONSTRAINT verified_plates_status_check
    CHECK (verification_status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_verified_plates_plate ON verified_plates (plate_number);
CREATE INDEX idx_verified_plates_user ON verified_plates (user_id);

CREATE TABLE messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text        NOT NULL,
  message_text text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Spiegelt die Validierung der Server Action auf DB-Ebene.
  CONSTRAINT messages_text_length_check
    CHECK (char_length(message_text) BETWEEN 1 AND 500)
);

-- Deckt das Dashboard ab: Nachrichten eines Kennzeichens, neueste zuerst.
CREATE INDEX idx_messages_plate_created ON messages (plate_number, created_at DESC);

-- Rollierendes Fenster je pseudonymisiertem IP-Hash (Details in 0005).
CREATE TABLE message_throttle (
  ip_hash      text        PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer     NOT NULL DEFAULT 0
);
