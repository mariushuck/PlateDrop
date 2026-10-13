import { Building2, Settings } from "lucide-react";
import Link from "next/link";
import { claimOrgPlate } from "@/app/dashboard/actions";
import ClaimPlateForm from "@/components/features/ClaimPlateForm";
import LeaveSiteButton from "@/components/features/LeaveSiteButton";
import type { Membership } from "@/lib/db/types";

/**
 * Gelände, an denen der Nutzer Mitglied ist oder es werden will, und die
 * Organisationen, die er verwaltet. Ohne beides erscheint der Abschnitt nicht.
 */
export default function SitesSection({
  memberships,
  adminOrgs,
}: {
  memberships: Membership[];
  adminOrgs: Array<{ name: string; slug: string }>;
}) {
  if (memberships.length === 0 && adminOrgs.length === 0) return null;

  // Ein Formular je Organisation, in der der Nutzer aktiv ist.
  const activeOrgs = new Map<string, string>();
  for (const m of memberships) {
    if (m.status === "active" && m.org_name) activeOrgs.set(m.org_id, m.org_name);
  }

  return (
    <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
        <Building2 className="h-5 w-5" />
        Gelände
      </h2>

      {adminOrgs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {adminOrgs.map((org) => (
            <Link
              key={org.slug}
              href={`/o/${org.slug}/admin`}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100"
            >
              <Settings className="h-4 w-4" />
              {org.name} verwalten
            </Link>
          ))}
        </div>
      )}

      {memberships.length > 0 && (
        <ul className="mb-6 space-y-3">
          {memberships.map((m) => (
            <li key={m.site_id} className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-semibold">{m.site_name}</span>
              {m.org_name && <span> · {m.org_name}</span>}
              {m.status === "pending" && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  wartet auf Bestätigung
                </span>
              )}
              <LeaveSiteButton siteId={m.site_id} pending={m.status === "pending"} />
            </li>
          ))}
        </ul>
      )}

      {[...activeOrgs].map(([orgId, orgName]) => (
        <div key={orgId} className="border-t border-slate-200 pt-4 dark:border-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
            Kennzeichen für {orgName}
          </p>
          <ClaimPlateForm action={claimOrgPlate} hiddenFields={{ orgId }} />
        </div>
      ))}
    </section>
  );
}
