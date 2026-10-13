import NotificationSettingsForm from "@/components/features/NotificationSettingsForm";
import { requireUser } from "@/lib/auth/session";
import { getNotificationSettings } from "@/lib/db/queries";
import SettingsForms from "./SettingsForms";

/**
 * Server Component: lädt die gespeicherten Benachrichtigungs-Einstellungen; die
 * Formulare darunter sind Client Components.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const notifications = await getNotificationSettings(user.id);

  return (
    <div className="mx-auto max-w-lg space-y-10 px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Einstellungen</h1>
      <NotificationSettingsForm initial={notifications} />
      <SettingsForms />
    </div>
  );
}
