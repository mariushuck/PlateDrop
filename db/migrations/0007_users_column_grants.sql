-- ===========================================================================
-- 0007 – Rechte der App-Rolle auf `users` spaltenscharf
-- ===========================================================================
-- Die better-auth-Tabellen haben bewusst keine RLS (0002). Damit ein Query-Bug
-- in einem withUser/withAnon-Block sich nicht selbst zum Admin machen kann,
-- bekommt `platedrop_app` auf `users` kein pauschales UPDATE mehr, sondern nur
-- die Spalten, die better-auth im Betrieb tatsächlich schreibt (Name, E-Mail,
-- Bestätigungsstatus, Avatar, Zeitstempel). `is_admin` bleibt außen vor – das
-- Flag vergibt ausschließlich scripts/set-admin.mjs als Owner.

REVOKE UPDATE ON users FROM platedrop_app;
GRANT UPDATE (name, email, "emailVerified", image, "updatedAt") ON users TO platedrop_app;
