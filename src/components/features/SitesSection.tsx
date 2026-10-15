import { Building2, ChevronRight, Settings } from "lucide-react";
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
    <section className="space-y-6">
      <div>
        <h2 className="section-header">Gelände</h2>
        <ul className="inset-group">
          {adminOrgs.map((org) => (
            <li key={org.slug} className="list-row relative active:opacity-60">
              <Settings className="h-5 w-5 shrink-0 text-tint" aria-hidden="true" />
              {/* The link covers the whole row. */}
              <Link
                href={`/o/${org.slug}/admin`}
                className="flex-1 text-[17px] after:absolute after:inset-0"
              >
                {org.name} verwalten
              </Link>
              <ChevronRight className="h-5 w-5 text-secondary" aria-hidden="true" />
            </li>
          ))}
          {memberships.map((m) => (
            <li key={m.site_id} className="list-row flex-wrap">
              <Building2 className="h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[17px]">{m.site_name}</p>
                <p className="text-[13px] text-secondary">
                  {m.org_name}
                  {m.status === "pending" && (
                    <span className="text-warning">
                      {m.org_name && " · "}wartet auf Bestätigung
                    </span>
                  )}
                </p>
              </div>
              <LeaveSiteButton siteId={m.site_id} pending={m.status === "pending"} />
            </li>
          ))}
        </ul>
      </div>

      {[...activeOrgs].map(([orgId, orgName]) => (
        <div key={orgId}>
          <h2 className="section-header">Kennzeichen für {orgName}</h2>
          <div className="inset-group p-4">
            <ClaimPlateForm action={claimOrgPlate} hiddenFields={{ orgId }} />
          </div>
        </div>
      ))}
    </section>
  );
}
