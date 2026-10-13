-- ===========================================================================
-- 0010 – better-auth 1.7.3+: accounts.issuer entfällt
-- ===========================================================================
-- better-auth 1.7.0–1.7.2 führte eine Pflichtspalte `issuer` samt Unique-Index
-- (issuer, accountId) ein; ab 1.7.3 erkennt es Konten wieder an
-- (providerId, accountId) und schreibt `issuer` nicht mehr. Mit NOT NULL
-- scheitert dann jeder Insert in `accounts`, also jede Registrierung.
-- Reihenfolge laut Upgrade-Guide: erst den Index, dann die Spalte.
-- https://www.better-auth.com/docs/guides/1-7-upgrade-guide

DROP INDEX IF EXISTS "accounts_issuer_accountId_uidx";
ALTER TABLE accounts DROP COLUMN IF EXISTS "issuer";
