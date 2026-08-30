import "server-only";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";
import { pool } from "@/lib/db/pool";
import { sendMail } from "@/lib/email/mailer";
import { emailChangeEmail, passwordResetEmail, verificationEmail } from "@/lib/email/templates";
import { requireEnv } from "@/lib/env";

/**
 * better-auth verwaltet Nutzer, Sessions, Konten und Verifizierungs-Token in
 * unserem eigenen Postgres — dieselbe Datenbank wie die Fachtabellen, aber
 * über den `pg`-Pool statt über eine externe API.
 *
 * `is_admin` liegt als Zusatzfeld direkt auf der Nutzertabelle; eine eigene
 * `profiles`-Tabelle wie unter Supabase gibt es nicht mehr.
 */
const BASE_URL = requireEnv("BETTER_AUTH_URL");
const IS_HTTPS = BASE_URL.startsWith("https://");

export const auth = betterAuth({
  database: pool,
  // Beide Pflicht: ohne Secret keine gültigen Tokens, ohne echte baseURL
  // degradieren Origin-Prüfung und secure Cookies still.
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: BASE_URL,

  // Origin-/CSRF-Prüfung explizit an die konfigurierte Domain binden.
  trustedOrigins: [new URL(BASE_URL).origin],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    // Lesen von Nachrichten setzt ein bestätigtes Konto voraus.
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const mail = passwordResetEmail(url);
      await sendMail({ to: user.email, ...mail });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const mail = verificationEmail(url);
      await sendMail({ to: user.email, ...mail });
    },
  },

  user: {
    modelName: "users",
    additionalFields: {
      // Nur per SQL/Admin setzbar – `input: false` hält das Feld aus allen
      // Registrierungs- und Update-Payloads heraus.
      isAdmin: {
        type: "boolean",
        defaultValue: false,
        input: false,
        fieldName: "is_admin",
      },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        const mail = emailChangeEmail(url, newEmail);
        // Die Bestätigung geht an die bisherige Adresse, damit eine
        // übernommene Session die E-Mail nicht unbemerkt umhängen kann.
        await sendMail({ to: user.email, ...mail });
      },
    },
  },

  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },

  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
    // Explizit statt „automatisch, wenn https": secure Cookies (+ `__Secure-`-
    // Präfix) hängen sonst still an einer korrekt gesetzten baseURL.
    useSecureCookies: IS_HTTPS,
    defaultCookieAttributes: {
      httpOnly: true,
      // Nicht „strict": die Bestätigungs- und Reset-Links aus den E-Mails sind
      // Top-Level-Navigationen von einer fremden Herkunft; „strict" würde die
      // Session dort nicht mitsenden und einen zweiten Klick erzwingen.
      sameSite: "lax",
    },
  },

  // Muss zuletzt stehen: sorgt dafür, dass Set-Cookie aus Server Actions
  // heraus tatsächlich gesetzt wird.
  plugins: [nextCookies()],
});
