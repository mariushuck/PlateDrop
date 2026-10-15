import Link from "next/link";
import { notFound } from "next/navigation";
import ActionButton from "@/components/features/ActionButton";
import ActionForm from "@/components/features/ActionForm";
import { requireUser } from "@/lib/auth/session";
import {
  listAllowlist,
  listOrgMembers,
  listOrgPlates,
  listOrgSites,
  orgForAdmin,
  orgWeeklyStats,
} from "@/lib/db/queries";
import {
  addAllowlistAction,
  approveMemberAction,
  createSiteAction,
  decidePlateAction,
  removeAllowlistAction,
  removeMemberAction,
  renewSiteTokenAction,
  saveOrgSettingsAction,
  setSiteDisabledAction,
} from "./actions";

const card = "inset-group p-4";
const heading = "mb-3 text-[20px] font-semibold";
const muted = "text-[15px] text-secondary";
const input = "field";

/**
 * Verwaltung einer Organisation: Beitritte, Kennzeichen, Standorte samt
 * Aushang, Fuhrparkliste, Einstellungen, Statistik. Nachrichten von Mitgliedern
 * sieht ein Org-Admin hier nie – nur die Zahl der Vorfälle.
 */
export default async function OrgAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const org = await orgForAdmin(user.id, slug);
  if (!org) notFound();

  const [members, plates, sites, allowlist, stats] = await Promise.all([
    listOrgMembers(user.id, org.id),
    listOrgPlates(user.id, org.id),
    listOrgSites(user.id, org.id),
    listAllowlist(user.id, org.id),
    orgWeeklyStats(user.id, org.id),
  ]);
  const pendingMembers = members.filter((m) => m.status === "pending");
  const activeMembers = members.filter((m) => m.status === "active");
  const pendingPlates = plates.filter((p) => p.verification_status === "pending");
  const approvedPlates = plates.filter((p) => p.verification_status === "approved");
  const who = (m: { name: string; email: string }) => (m.name ? `${m.name} (${m.email})` : m.email);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6 pb-8">
      <h1 className="large-title">Verwaltung</h1>
      <section className={card}>
        <h2 className={heading}>Offene Anfragen</h2>
        {pendingMembers.length === 0 && pendingPlates.length === 0 ? (
          <p className={muted}>Nichts zu tun.</p>
        ) : (
          <ul className="space-y-5">
            {pendingMembers.map((m) => (
              <li key={`${m.site_id}-${m.user_id}`} className="space-y-2">
                <p className="text-[15px]">
                  <span className="font-semibold">{who(m)}</span> möchte {m.site_name} beitreten
                </p>
                <div className="flex gap-2">
                  <ActionButton
                    label="Bestätigen"
                    variant="primary"
                    action={approveMemberAction.bind(null, slug, m.site_id, m.user_id)}
                  />
                  <ActionButton
                    label="Ablehnen"
                    confirmLabel="Wirklich ablehnen"
                    action={removeMemberAction.bind(null, slug, m.site_id, m.user_id)}
                  />
                </div>
              </li>
            ))}
            {pendingPlates.map((p) => (
              <li key={p.id} className="space-y-2">
                <p className="flex flex-wrap items-center gap-2 text-[15px]">
                  <span className="plate">{p.plate_number}</span> für {who(p)}
                </p>
                <div className="flex gap-2">
                  <ActionButton
                    label="Freigeben"
                    variant="primary"
                    action={decidePlateAction.bind(null, slug, p.id, true)}
                  />
                  <ActionButton
                    label="Ablehnen"
                    confirmLabel="Wirklich ablehnen"
                    action={decidePlateAction.bind(null, slug, p.id, false)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className={heading}>Mitglieder ({activeMembers.length})</h2>
        {activeMembers.length === 0 ? (
          <p className={muted}>Noch keine. Mitglieder treten über den Aushang-Code bei.</p>
        ) : (
          <ul className="space-y-3">
            {activeMembers.map((m) => (
              <li
                key={`${m.site_id}-${m.user_id}`}
                className="flex flex-wrap items-center justify-between gap-2 text-[15px]"
              >
                <span>
                  {who(m)} · {m.site_name}
                </span>
                <ActionButton
                  label="Entfernen"
                  confirmLabel="Entfernen und Kennzeichen beenden"
                  action={removeMemberAction.bind(null, slug, m.site_id, m.user_id)}
                />
              </li>
            ))}
          </ul>
        )}
        {approvedPlates.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 text-[15px] font-semibold">Freigegebene Kennzeichen</h3>
            <ul className="space-y-2 text-[15px]">
              {approvedPlates.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="plate">{p.plate_number}</span> {who(p)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={card}>
        <h2 className={heading}>Standorte</h2>
        <ul className="mb-6 space-y-4">
          {sites.map((site) => (
            <li key={site.id} className="space-y-2">
              <p className="text-[17px] font-semibold">
                {site.name}
                {site.disabled && <span className={`ml-2 ${muted}`}>(deaktiviert)</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {!site.disabled && (
                  <Link
                    href={`/o/${slug}/admin/sites/${site.id}/aushang`}
                    className="btn btn-sm btn-primary"
                  >
                    Aushang drucken
                  </Link>
                )}
                <ActionButton
                  label={site.disabled ? "Aktivieren" : "Deaktivieren"}
                  action={setSiteDisabledAction.bind(null, slug, site.id, !site.disabled)}
                />
                <ActionButton
                  label="Neuen Code erzeugen"
                  confirmLabel="Alte Aushänge werden ungültig"
                  action={renewSiteTokenAction.bind(null, slug, site.id)}
                />
              </div>
            </li>
          ))}
        </ul>
        <ActionForm action={createSiteAction.bind(null, slug)} submitLabel="Standort anlegen">
          <label className="flex flex-col gap-1.5 text-[15px] text-secondary">
            Neuer Standort
            <input
              name="name"
              required
              maxLength={100}
              placeholder="z. B. Tiefgarage Nord"
              className={input}
            />
          </label>
        </ActionForm>
      </section>

      <section className={card}>
        <h2 className={heading}>Fuhrpark- und Parkausweisliste</h2>
        <p className={`mb-4 ${muted}`}>
          Kennzeichen auf dieser Liste gelten sofort, wenn ein Mitglied sie beansprucht. Alle
          anderen gibst du oben frei.
        </p>
        {allowlist.length > 0 && (
          <ul className="mb-4 space-y-2">
            {allowlist.map((plate) => (
              <li key={plate} className="flex items-center justify-between gap-2">
                <span className="plate">{plate}</span>
                <ActionButton
                  label="Entfernen"
                  action={removeAllowlistAction.bind(null, slug, plate)}
                />
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addAllowlistAction.bind(null, slug)} submitLabel="Hinzufügen">
          <label className="flex flex-col gap-1.5 text-[15px] text-secondary">
            Kennzeichen
            <input
              name="plateNumber"
              required
              placeholder="KA-AB-1234"
              className={`${input} uppercase`}
            />
          </label>
        </ActionForm>
      </section>

      <section className={card}>
        <h2 className={heading}>Einstellungen</h2>
        <ActionForm action={saveOrgSettingsAction.bind(null, slug)} submitLabel="Speichern">
          <label className="flex cursor-pointer items-start justify-between gap-3 text-[17px]">
            <span>
              Absendername zeigen
              <span className={`block ${muted}`}>
                Empfänger sehen den Anzeigenamen angemeldeter Absender. Besucher bleiben anonym.
              </span>
            </span>
            <input
              type="checkbox"
              name="showSender"
              defaultChecked={org.show_sender}
              className="switch"
            />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-3 text-[17px]">
            <span>
              Freitext für Mitglieder erlauben
              <span className={`block ${muted}`}>
                Angemeldete Mitglieder dürfen eigene Nachrichten schreiben. Anonyme nie.
              </span>
            </span>
            <input
              type="checkbox"
              name="allowFreeText"
              defaultChecked={org.allow_free_text}
              className="switch"
            />
          </label>
        </ActionForm>
      </section>

      <section className={card}>
        <h2 className={heading}>Vorfälle der letzten 12 Wochen</h2>
        {stats.length === 0 ? (
          <p className={muted}>Noch keine Nachrichten über die Standort-Codes.</p>
        ) : (
          <table className="w-full text-left text-[15px] tabular-nums">
            <thead>
              <tr className={muted}>
                <th className="py-1 font-medium">Woche ab</th>
                <th className="py-1 font-medium">Standort</th>
                <th className="py-1 text-right font-medium">Nachrichten</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr
                  key={`${row.week}-${row.site_name}`}
                  className="border-t-[0.5px] border-separator"
                >
                  <td className="py-2">{new Date(row.week).toLocaleDateString("de-DE")}</td>
                  <td className="py-2">{row.site_name}</td>
                  <td className="py-2 text-right">{row.incidents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={`mt-3 ${muted}`}>Nur Zahlen je Standort, nie je Person.</p>
      </section>
    </div>
  );
}
