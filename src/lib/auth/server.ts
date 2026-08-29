import "server-only";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { pool } from "@/lib/db/pool";
import { sendMail } from "@/lib/email/mailer";
import { emailChangeEmail, passwordResetEmail, verificationEmail } from "@/lib/email/templates";

/**
 * better-auth verwaltet Nutzer, Sessions, Konten und Verifizierungs-Token in
 * unserem eigenen Postgres — dieselbe Datenbank wie die Fachtabellen, aber
 * über den `pg`-Pool statt über eine externe API.
 *
 * `is_admin` liegt als Zusatzfeld direkt auf der Nutzertabelle; eine eigene
 * `profiles`-Tabelle wie unter Supabase gibt es nicht mehr.
 */
export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
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
  },

  // Muss zuletzt stehen: sorgt dafür, dass Set-Cookie aus Server Actions
  // heraus tatsächlich gesetzt wird.
  plugins: [nextCookies()],
});
