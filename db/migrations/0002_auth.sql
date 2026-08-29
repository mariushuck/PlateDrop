-- ===========================================================================
-- 0002 – better-auth-Tabellen
-- ===========================================================================
-- Generiert mit `node scripts/generate-auth-schema.mjs` für better-auth 1.7.2.
-- Bei einem Upgrade neu erzeugen statt von Hand nachzuziehen.
--
-- Bewusst OHNE Row Level Security: better-auth legt Nutzer und Sessions an,
-- bevor überhaupt ein Nutzerkontext existiert (Registrierung, Login, Token-
-- Prüfung). Diese Tabellen erreicht ausschließlich die Auth-Bibliothek; die
-- Fachtabellen in 0003/0004 sind dagegen vollständig RLS-geschützt.
--
-- Spaltennamen sind camelCase (better-auth-Konvention) und deshalb in Quotes.
-- Einzige Ausnahme: is_admin, unser Zusatzfeld.

CREATE TABLE users (
  "id"            text        NOT NULL PRIMARY KEY,
  "name"          text        NOT NULL,
  "email"         text        NOT NULL UNIQUE,
  "emailVerified" boolean     NOT NULL,
  "image"         text,
  "createdAt"     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- DEFAULT ergänzt: erlaubt Inserts aus SQL/Tests ohne die Spalte zu nennen.
  -- Admin-Rechte werden ausschließlich per SQL vergeben, nie über die App.
  "is_admin"      boolean     NOT NULL DEFAULT false
);

CREATE TABLE sessions (
  "id"        text        NOT NULL PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token"     text        NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text        NOT NULL REFERENCES users ("id") ON DELETE CASCADE
);

CREATE TABLE accounts (
  "id"                    text        NOT NULL PRIMARY KEY,
  "issuer"                text        NOT NULL,
  "accountId"             text        NOT NULL,
  "providerId"            text        NOT NULL,
  "userId"                text        NOT NULL REFERENCES users ("id") ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  -- Passwort-Hash (scrypt) für den E-Mail/Passwort-Provider.
  "password"              text,
  "createdAt"             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             timestamptz NOT NULL
);

CREATE TABLE verifications (
  "id"         text        NOT NULL PRIMARY KEY,
  "identifier" text        NOT NULL,
  "value"      text        NOT NULL,
  "expiresAt"  timestamptz NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "sessions_userId_idx" ON sessions ("userId");
CREATE INDEX "accounts_userId_idx" ON accounts ("userId");
CREATE INDEX "verifications_identifier_idx" ON verifications ("identifier");
CREATE UNIQUE INDEX "accounts_issuer_accountId_uidx" ON accounts ("issuer", "accountId");

-- better-auth verwaltet diese Tabellen vollständig selbst.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications TO platedrop_app;
