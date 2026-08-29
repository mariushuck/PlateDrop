"use client";
import { createAuthClient } from "better-auth/react";

/**
 * Auth-Client für Client Components. Ohne `baseURL` spricht er denselben
 * Origin an, unter dem die Seite ausgeliefert wird — damit funktioniert
 * dieselbe Konfiguration lokal, im Container und hinter dem Proxy.
 */
export const authClient = createAuthClient();
